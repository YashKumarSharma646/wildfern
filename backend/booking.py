"""Booking rules: opening hours, slot availability, capacity checks and owner stats."""

from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .config import settings
from .models import Reservation
from .schemas import Slot, minutes_to_hhmm

# Unambiguous characters (no 0/O, 1/I/L) so codes are easy to read out loud.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

# Statuses that occupy seats. A no-show or a cancellation frees the table.
ACTIVE = ("confirmed", "seated")
STATUSES = ("confirmed", "seated", "no_show", "cancelled")


class BookingError(Exception):
    def __init__(self, field: str | None, message: str, status: int = 422):
        super().__init__(message)
        self.field = field
        self.message = message
        self.status = status


def cafe_now() -> datetime:
    return datetime.now(ZoneInfo(settings.cafe_timezone))


def all_slots() -> list[int]:
    return list(range(settings.open_minute, settings.last_seating_minute + 1, settings.slot_minutes))


def new_code() -> str:
    return "WF-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


def _active_on(session: Session, day: date, exclude_id: int | None = None) -> list[Reservation]:
    q = select(Reservation).where(Reservation.date == day, Reservation.status.in_(ACTIVE))
    if exclude_id is not None:
        q = q.where(Reservation.id != exclude_id)
    return list(session.scalars(q))


def seats_in_use(bookings: list[Reservation], minute: int) -> int:
    """Seats occupied at `minute` by bookings whose visit window covers it."""
    return sum(
        b.party_size for b in bookings if b.start_minute <= minute < b.start_minute + settings.visit_minutes
    )


def seats_free_for_visit(bookings: list[Reservation], start: int) -> int:
    """The fewest free seats at any point during a visit starting at `start`."""
    checkpoints = range(start, start + settings.visit_minutes, settings.slot_minutes)
    return min(settings.bookable_seats - seats_in_use(bookings, m) for m in checkpoints)


def validate_when(day: date, start: int, staff: bool = False) -> None:
    """Online guests need notice and a future time. The team can book any slot today
    (e.g. a walk-in who just arrived), but never a past date."""
    now = cafe_now()
    today = now.date()
    if day < today:
        raise BookingError("date", "That date has already passed.")
    if day > today + timedelta(days=settings.booking_window_days):
        raise BookingError("date", f"We take bookings up to {settings.booking_window_days} days ahead.")
    if start not in all_slots():
        raise BookingError("time", "Please choose one of the listed times (every half hour, 7:00 – 17:30).")
    if not staff and day == today and start < now.hour * 60 + now.minute + settings.min_notice_minutes:
        raise BookingError("time", "For today, please pick a time at least an hour from now.")


def availability(session: Session, day: date) -> list[Slot]:
    bookings = _active_on(session, day)
    now = cafe_now()
    earliest = now.hour * 60 + now.minute + settings.min_notice_minutes if day == now.date() else -1
    slots = []
    for m in all_slots():
        left = max(0, seats_free_for_visit(bookings, m))
        slots.append(Slot(time=minutes_to_hhmm(m), available=left > 0 and m >= earliest, seats_left=left))
    return slots


def lock_day(session: Session, day: date) -> None:
    """Serialise bookings for one date so two requests can't take the same last seats."""
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": day.toordinal()})
    # SQLite allows a single writer at a time, which already serialises these transactions.


def _check_capacity(bookings: list[Reservation], start: int, party: int) -> None:
    free = seats_free_for_visit(bookings, start)
    if free < party:
        if free <= 0:
            raise BookingError("time", "That time is fully booked — please try another.", status=409)
        raise BookingError(
            "time",
            f"Only {free} seat{'s' if free != 1 else ''} left at that time — try a smaller party or another time.",
            status=409,
        )


def create_reservation(
    session: Session,
    *,
    name: str,
    email: str,
    day: date,
    start: int,
    party: int,
    source: str = "online",
    phone: str | None = None,
    notes: str | None = None,
    staff: bool = False,
) -> Reservation:
    validate_when(day, start, staff=staff)
    with session.begin():
        lock_day(session, day)
        _check_capacity(_active_on(session, day), start, party)
        code = new_code()
        while session.scalar(select(Reservation.id).where(Reservation.code == code)) is not None:
            code = new_code()
        booking = Reservation(
            code=code,
            name=name,
            email=(email or "").lower(),
            date=day,
            start_minute=start,
            party_size=party,
            status="confirmed",
            source=source,
            phone=phone or None,
            notes=notes or None,
        )
        session.add(booking)
    return booking


def set_status(session: Session, code: str, status: str) -> Reservation:
    """Owner action. Bringing a booking back (e.g. un-cancelling) re-checks capacity first."""
    with session.begin():
        r = session.scalar(select(Reservation).where(Reservation.code == code.strip().upper()))
        if r is None:
            raise BookingError(None, "No booking with that code.", status=404)
        if status in ACTIVE and r.status not in ACTIVE:
            lock_day(session, r.date)
            _check_capacity(_active_on(session, r.date, exclude_id=r.id), r.start_minute, r.party_size)
        now = datetime.now(timezone.utc)
        r.status = status
        r.updated_at = now
        r.cancelled_at = now if status == "cancelled" else None
    return r


# --------------------------------------------------------------------------- owner stats


def day_summary(session: Session, day: date) -> dict:
    rows = list(session.scalars(select(Reservation).where(Reservation.date == day)))
    active = [r for r in rows if r.status in ACTIVE]
    slots = [
        {
            "time": minutes_to_hhmm(m),
            "seats_used": seats_in_use(active, m),
            "arrivals": sum(1 for r in active if r.start_minute == m),
        }
        for m in all_slots()
    ]
    by_status = {s: sum(1 for r in rows if r.status == s) for s in STATUSES}
    return {
        "date": day,
        "capacity": settings.bookable_seats,
        "slots": slots,
        "bookings": len(active),
        "covers": sum(r.party_size for r in active),
        "by_status": by_status,
        "busiest": max(slots, key=lambda s: s["seats_used"]) if active else None,
    }


def week_ahead(session: Session, start: date, days: int = 7) -> list[dict]:
    end = start + timedelta(days=days - 1)
    rows = list(
        session.scalars(
            select(Reservation).where(Reservation.date >= start, Reservation.date <= end, Reservation.status.in_(ACTIVE))
        )
    )
    out = []
    for i in range(days):
        d = start + timedelta(days=i)
        todays = [r for r in rows if r.date == d]
        out.append({"date": d, "bookings": len(todays), "covers": sum(r.party_size for r in todays)})
    return out


def last_30_days(session: Session) -> dict:
    """Behaviour over bookings whose visit date has passed (or is today), last 30 days."""
    today = cafe_now().date()
    rows = list(
        session.scalars(select(Reservation).where(Reservation.date >= today - timedelta(days=30), Reservation.date <= today))
    )
    total = len(rows)
    kept = [r for r in rows if r.status != "cancelled"]
    resolved = [r for r in rows if r.status in ("seated", "no_show")]
    return {
        "bookings": total,
        "covers": sum(r.party_size for r in kept),
        "avg_party": round(sum(r.party_size for r in kept) / len(kept), 1) if kept else None,
        "no_show_rate": round(sum(1 for r in resolved if r.status == "no_show") / len(resolved), 3) if resolved else None,
        "cancel_rate": round(sum(1 for r in rows if r.status == "cancelled") / total, 3) if total else None,
        "online_share": round(sum(1 for r in rows if r.source == "online") / total, 3) if total else None,
    }
