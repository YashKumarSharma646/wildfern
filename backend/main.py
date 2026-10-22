"""Wildfern API — reservations, booking passes, check-in, owner dashboard, menu and newsletter.

Run locally:  python -m uvicorn backend.main:app --reload --port 8000
Interactive docs: http://localhost:8000/api/docs
"""

from __future__ import annotations

import base64
import csv
import hashlib
import hmac
import io
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import booking, notify, passes
from .booking import BookingError
from .config import settings
from .db import get_session, init_db
from .menu import MENU
from .models import Reservation, Subscriber
from .schemas import (
    AdminReservationOut,
    Availability,
    CheckinIn,
    CheckinOut,
    EmailIn,
    LoginIn,
    MenuItem,
    PassOut,
    ReservationIn,
    ReservationOut,
    StaffReservationIn,
    StatusIn,
    SubscriberOut,
    hhmm_to_minutes,
    minutes_to_hhmm,
)

# --------------------------------------------------------------------------- setup

_db_ready = False
_db_lock = threading.Lock()


def ensure_db() -> None:
    """Create tables (and add any new columns) on first use. Serverless platforms don't
    always run lifespan hooks."""
    global _db_ready
    if _db_ready:
        return
    with _db_lock:
        if not _db_ready:
            init_db()
            _db_ready = True


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_db()
    yield


app = FastAPI(
    title="Wildfern API",
    version="1.1.0",
    description="Reservations, booking passes, check-in, owner dashboard, menu and newsletter for the Wildfern café.",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Content-Type", "Authorization"],
    )


def db(session: Session = Depends(get_session)) -> Session:
    ensure_db()
    return session


# --------------------------------------------------------------------------- errors

FRIENDLY = {
    "name": "Please tell us your name (at least two characters).",
    "email": "That email address doesn’t look quite right.",
    "date": "Choose a valid date for your visit.",
    "time": "Choose a time.",
    "party_size": "Party size must be between 1 and 8.",
    "phone": "That phone number is too long.",
    "password": "Enter the owner password.",
}


def error(status: int, message: str, field: str | None = None, errors: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": message, "field": field, "errors": errors or {}})


@app.exception_handler(RequestValidationError)
async def _validation_handler(_: Request, exc: RequestValidationError):
    errors: dict[str, str] = {}
    for e in exc.errors():
        loc = [str(p) for p in e.get("loc", []) if p not in ("body", "query", "path")]
        field = loc[-1] if loc else "request"
        errors.setdefault(field, FRIENDLY.get(field, e.get("msg", "Invalid value.")))
    first = next(iter(errors.items()), ("request", "Invalid request."))
    return error(422, first[1], first[0], errors)


@app.exception_handler(BookingError)
async def _booking_handler(_: Request, exc: BookingError):
    return error(exc.status, exc.message, exc.field, {exc.field: exc.message} if exc.field else None)


@app.exception_handler(HTTPException)
async def _http_handler(_: Request, exc: HTTPException):
    return error(exc.status_code, str(exc.detail))


# --------------------------------------------------------------------------- rate limit

_hits: dict[str, deque[float]] = defaultdict(deque)
_hits_lock = threading.Lock()


def rate_limit(limit: int, window_s: int):
    """Best-effort per-IP limit. Per instance only — fine as spam friction, not as security."""

    def check(request: Request) -> None:
        fwd = request.headers.get("x-forwarded-for", "")
        ip = fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")
        key = f"{request.url.path}:{ip}"
        now = time.monotonic()
        with _hits_lock:
            q = _hits[key]
            while q and now - q[0] > window_s:
                q.popleft()
            if len(q) >= limit:
                raise HTTPException(status_code=429, detail="Too many requests — please wait a few minutes and try again.")
            q.append(now)

    return check


# --------------------------------------------------------------------------- owner auth

SESSION_HOURS = 12


def _session_sig(payload: str) -> str:
    key = hashlib.sha256(b"wildfern-admin-session:" + settings.admin_token.encode()).digest()
    return base64.urlsafe_b64encode(hmac.new(key, payload.encode(), hashlib.sha256).digest()).decode().rstrip("=")


def issue_session() -> tuple[str, int]:
    exp = int(time.time()) + SESSION_HOURS * 3600
    payload = f"v1.{exp}"
    return f"{payload}.{_session_sig(payload)}", exp


def require_admin(authorization: str = Header(default="")) -> None:
    """Accepts a signed dashboard session, or the raw ADMIN_TOKEN (for scripts and curl)."""
    if not settings.admin_token:
        raise HTTPException(status_code=503, detail="Owner access isn’t set up yet (ADMIN_TOKEN is missing).")
    token = authorization.removeprefix("Bearer ").strip()
    if token and hmac.compare_digest(token, settings.admin_token):
        return
    parts = token.split(".")
    if len(parts) == 3 and parts[0] == "v1" and parts[1].isdigit():
        if int(parts[1]) > time.time() and hmac.compare_digest(parts[2], _session_sig(f"v1.{parts[1]}")):
            return
    raise HTTPException(status_code=401, detail="Please sign in again.")


# --------------------------------------------------------------------------- helpers


def to_out(r: Reservation) -> ReservationOut:
    return ReservationOut(
        code=r.code,
        name=r.name,
        email=r.email,
        date=r.date,
        time=minutes_to_hhmm(r.start_minute),
        party_size=r.party_size,
        status=r.status,
        pass_token=passes.pass_token(r.code),
    )


def to_admin(r: Reservation) -> AdminReservationOut:
    return AdminReservationOut(
        **to_out(r).model_dump(),
        source=r.source or "online",
        phone=r.phone,
        notes=r.notes,
        created_at=r.created_at,
        updated_at=r.updated_at,
        checked_in_at=r.checked_in_at,
    )


def find_owned(session: Session, code: str, email: str) -> Reservation:
    r = session.scalar(select(Reservation).where(Reservation.code == code.strip().upper()))
    # Same response for "no such code" and "wrong email" so codes can't be probed.
    if r is None or not r.email or not hmac.compare_digest(r.email, email.strip().lower()):
        raise HTTPException(status_code=404, detail="We couldn’t find a booking with that code and email.")
    return r


def csv_response(filename: str, header: list[str], rows: list[list]) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    # BOM so Excel opens accented names correctly.
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --------------------------------------------------------------------------- public routes


@app.get("/api/health")
def health(session: Session = Depends(db)):
    session.execute(select(1))
    return {
        "status": "ok",
        "database": "sqlite" if settings.is_sqlite else "postgres",
        "persistent": settings.is_persistent,
        "email": bool(settings.resend_api_key),
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/menu", response_model=list[MenuItem])
def menu():
    return MENU


@app.get("/api/availability", response_model=Availability)
def get_availability(day: date = Query(alias="date"), session: Session = Depends(db)):
    today = booking.cafe_now().date()
    if day < today or day > today + timedelta(days=settings.booking_window_days):
        return Availability(date=day, open=False, slots=[])
    return Availability(date=day, open=True, slots=booking.availability(session, day))


@app.post(
    "/api/reservations",
    response_model=ReservationOut,
    status_code=201,
    dependencies=[Depends(rate_limit(limit=8, window_s=600))],
)
def create_reservation(body: ReservationIn, session: Session = Depends(db)):
    if body.website:
        # Honeypot filled in: almost certainly a bot. Pretend nothing happened.
        raise HTTPException(status_code=400, detail="Something went wrong — please try again.")
    r = booking.create_reservation(
        session,
        name=body.name,
        email=str(body.email),
        day=body.date,
        start=hhmm_to_minutes(body.time),
        party=body.party_size,
    )
    notify.booking_created(r)
    return to_out(r)


@app.get("/api/reservations/{code}", response_model=ReservationOut)
def get_reservation(code: str, email: str = Query(min_length=3), session: Session = Depends(db)):
    return to_out(find_owned(session, code, email))


@app.post(
    "/api/reservations/{code}/cancel",
    response_model=ReservationOut,
    dependencies=[Depends(rate_limit(limit=20, window_s=600))],
)
def cancel_reservation(code: str, body: EmailIn, session: Session = Depends(db)):
    with session.begin():
        r = find_owned(session, code, str(body.email))
        if r.status in ("seated", "no_show"):
            raise HTTPException(status_code=409, detail="This visit has already happened, so it can’t be cancelled online.")
        changed = r.status != "cancelled"
        if changed:
            r.status = "cancelled"
            r.cancelled_at = r.updated_at = datetime.now(timezone.utc)
    if changed:
        notify.booking_cancelled(r)
    return to_out(r)


@app.get("/api/pass/{token}", response_model=PassOut, dependencies=[Depends(rate_limit(limit=60, window_s=600))])
def get_pass(token: str, session: Session = Depends(db)):
    """The page a pass QR opens. Shows the booking without needing the email."""
    code = passes.verify_token(token)
    r = session.scalar(select(Reservation).where(Reservation.code == code)) if code else None
    if r is None:
        raise HTTPException(status_code=404, detail="This booking pass isn’t valid.")
    return PassOut(code=r.code, name=r.name, date=r.date, time=minutes_to_hhmm(r.start_minute), party_size=r.party_size, status=r.status)


@app.post("/api/newsletter", dependencies=[Depends(rate_limit(limit=10, window_s=600))])
def subscribe(body: EmailIn, session: Session = Depends(db)):
    email = str(body.email).lower()
    try:
        with session.begin():
            if session.scalar(select(Subscriber.id).where(Subscriber.email == email)) is None:
                session.add(Subscriber(email=email))
    except IntegrityError:
        pass  # subscribed concurrently — same outcome
    # Same reply whether new or existing, so the list can't be probed.
    return {"ok": True, "message": "You’re on the list. Expect the occasional letter from the forest."}


# --------------------------------------------------------------------------- owner dashboard

admin = [Depends(require_admin)]


@app.post("/api/admin/login", dependencies=[Depends(rate_limit(limit=6, window_s=600))])
def admin_login(body: LoginIn):
    if not settings.admin_token:
        raise HTTPException(status_code=503, detail="Owner access isn’t set up yet (ADMIN_TOKEN is missing).")
    if not hmac.compare_digest(body.password.strip(), settings.admin_token):
        raise HTTPException(status_code=401, detail="That password isn’t right.")
    token, exp = issue_session()
    return {"token": token, "expires_at": exp}


def _reservation_query(day: date | None, start: date | None, end: date | None, q: str | None, status: str | None):
    stmt = select(Reservation).order_by(Reservation.date, Reservation.start_minute, Reservation.created_at)
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                Reservation.name.ilike(like),
                Reservation.email.ilike(like),
                Reservation.code.ilike(like),
                Reservation.phone.ilike(like),
            )
        )
    elif day:
        stmt = stmt.where(Reservation.date == day)
    if start:
        stmt = stmt.where(Reservation.date >= start)
    if end:
        stmt = stmt.where(Reservation.date <= end)
    if status:
        stmt = stmt.where(Reservation.status == status)
    return stmt.limit(1000)


@app.get("/api/admin/reservations", response_model=list[AdminReservationOut], dependencies=admin)
def admin_reservations(
    day: date | None = Query(default=None, alias="date"),
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=100),
    status: str | None = None,
    session: Session = Depends(db),
):
    """Bookings for one day, a date range, or a search across all dates."""
    return [to_admin(r) for r in session.scalars(_reservation_query(day, start, end, q, status))]


@app.get("/api/admin/reservations.csv", dependencies=admin)
def admin_reservations_csv(
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    session: Session = Depends(db),
):
    rows = session.scalars(_reservation_query(None, start, end, None, None))
    return csv_response(
        "wildfern-bookings.csv",
        ["Date", "Time", "Name", "Guests", "Status", "Source", "Code", "Email", "Phone", "Notes", "Booked at", "Checked in at"],
        [
            [r.date, minutes_to_hhmm(r.start_minute), r.name, r.party_size, r.status, r.source, r.code, r.email, r.phone or "",
             r.notes or "", r.created_at.isoformat(timespec="minutes") if r.created_at else "",
             r.checked_in_at.isoformat(timespec="minutes") if r.checked_in_at else ""]
            for r in rows
        ],
    )


@app.post("/api/admin/reservations", response_model=AdminReservationOut, status_code=201, dependencies=admin)
def admin_create_reservation(body: StaffReservationIn, session: Session = Depends(db)):
    """A phone or walk-in booking. Uses the same capacity as online bookings."""
    r = booking.create_reservation(
        session,
        name=body.name,
        email=str(body.email) if body.email else "",
        day=body.date,
        start=hhmm_to_minutes(body.time),
        party=body.party_size,
        source=body.source,
        phone=body.phone,
        notes=body.notes,
        staff=True,
    )
    if body.source == "walk-in":
        r = booking.set_status(session, r.code, "seated")
        _stamp_checkin(session, r)
    return to_admin(r)


@app.patch("/api/admin/reservations/{code}", response_model=AdminReservationOut, dependencies=admin)
def admin_set_status(code: str, body: StatusIn, session: Session = Depends(db)):
    r = booking.set_status(session, code, body.status)
    if body.status == "seated":
        _stamp_checkin(session, r)
    return to_admin(r)


def _local_hhmm(dt: datetime) -> str:
    # SQLite hands timestamps back without a timezone; they were stored as UTC.
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(booking.cafe_now().tzinfo).strftime("%H:%M")


def _stamp_checkin(session: Session, r: Reservation) -> None:
    with session.begin():
        r = session.merge(r)
        r.checked_in_at = r.checked_in_at or datetime.now(timezone.utc)


@app.post("/api/admin/checkin", response_model=CheckinOut, dependencies=admin)
def admin_checkin(body: CheckinIn, session: Session = Depends(db)):
    """Verify a scanned pass (or a typed code) at the door and check the guests in."""
    code, signed = passes.parse_scan(body.scan)
    if code is None:
        return CheckinOut(result="invalid", message="This isn’t a valid Wildfern booking pass.")
    r = session.scalar(select(Reservation).where(Reservation.code == code))
    if r is None:
        return CheckinOut(result="not_found", message=f"No booking found for {code}.")

    today = booking.cafe_now().date()
    first = r.name.split(" ")[0]
    if r.status == "seated":
        when = _local_hhmm(r.checked_in_at) if r.checked_in_at else "earlier"
        return CheckinOut(result="already_checked_in", message=f"{first}’s party was already checked in at {when}.", booking=to_admin(r))
    if r.status == "cancelled" and not body.force:
        return CheckinOut(
            result="cancelled", message="This booking was cancelled.", booking=to_admin(r), can_force=True
        )
    if r.date != today and not body.force:
        return CheckinOut(
            result="not_today",
            message=f"This booking is for {r.date:%A %d %B} at {minutes_to_hhmm(r.start_minute)}, not today.",
            booking=to_admin(r),
            can_force=True,
        )
    session.rollback()
    r = booking.set_status(session, code, "seated")
    _stamp_checkin(session, r)
    session.refresh(r)
    how = "" if signed else " (code entered by hand)"
    return CheckinOut(
        result="checked_in",
        message=f"Welcome, {first} — table for {r.party_size} at {minutes_to_hhmm(r.start_minute)}.{how}",
        booking=to_admin(r),
    )


@app.get("/api/admin/summary", dependencies=admin)
def admin_summary(day: date | None = Query(default=None, alias="date"), session: Session = Depends(db)):
    day = day or booking.cafe_now().date()
    return {
        "today": booking.cafe_now().date(),
        "day": booking.day_summary(session, day),
        "week": booking.week_ahead(session, day),
        "last_30_days": booking.last_30_days(session),
        "subscribers": session.query(Subscriber).count(),
        "email_enabled": bool(settings.resend_api_key),
    }


@app.get("/api/admin/subscribers", response_model=list[SubscriberOut], dependencies=admin)
def admin_subscribers(session: Session = Depends(db)):
    return [SubscriberOut(email=s.email, created_at=s.created_at) for s in session.scalars(select(Subscriber).order_by(Subscriber.created_at.desc()))]


@app.get("/api/admin/subscribers.csv", dependencies=admin)
def admin_subscribers_csv(session: Session = Depends(db)):
    subs = session.scalars(select(Subscriber).order_by(Subscriber.created_at))
    return csv_response(
        "wildfern-newsletter.csv",
        ["Email", "Subscribed at"],
        [[s.email, s.created_at.isoformat(timespec="minutes") if s.created_at else ""] for s in subs],
    )
