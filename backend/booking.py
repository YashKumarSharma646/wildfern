"""Booking rules: opening hours, slot availability and capacity checks."""

from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .config import settings
from .models import Reservation
from .schemas import Slot, minutes_to_hhmm

# Unambiguous characters (no 0/O, 1/I/L) so codes are easy to read out loud.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


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


def _active_on(session: Session, day: date) -> list[Reservation]:
    return list(
        session.scalars(select(Reservation).where(Reservation.date == day, Reservation.status == "confirmed"))
    )


def seats_in_use(bookings: list[Reservation], minute: int) -> int:
    """Seats occupied at `minute` by bookings whose visit window covers it."""
    return sum(
        b.party_size for b in bookings if b.start_minute <= minute < b.start_minute + settings.visit_minutes
    )


def seats_free_for_visit(bookings: list[Reservation], start: int) -> int:
    """The fewest free seats at any point during a visit starting at `start`."""
    checkpoints = range(start, start + settings.visit_minutes, settings.slot_minutes)
    return min(settings.bookable_seats - seats_in_use(bookings, m) for m in checkpoints)


def validate_when(day: date, start: int) -> None:
    now = cafe_now()
    today = now.date()
    if day < today:
        raise BookingError("date", "That date has already passed.")
    if day > today + timedelta(days=settings.booking_window_days):
        raise BookingError("date", f"We take bookings up to {settings.booking_window_days} days ahead.")
    if start not in all_slots():
        raise BookingError("time", "Please choose one of the listed times (every half hour, 7:00 – 17:30).")
    if day == today and start < now.hour * 60 + now.minute + settings.min_notice_minutes:
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


def create_reservation(session: Session, *, name: str, email: str, day: date, start: int, party: int) -> Reservation:
    validate_when(day, start)
    with session.begin():
        lock_day(session, day)
        bookings = _active_on(session, day)
        free = seats_free_for_visit(bookings, start)
        if free < party:
            if free <= 0:
                raise BookingError("time", "That time is fully booked — please try another.", status=409)
            raise BookingError(
                "time", f"Only {free} seat{'s' if free != 1 else ''} left at that time — try a smaller party or another time.", status=409
            )
        code = new_code()
        while session.scalar(select(Reservation.id).where(Reservation.code == code)) is not None:
            code = new_code()
        booking = Reservation(
            code=code, name=name, email=email.lower(), date=day, start_minute=start, party_size=party, status="confirmed"
        )
        session.add(booking)
    return booking
