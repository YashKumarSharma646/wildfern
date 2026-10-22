"""Wildfern API — reservations, availability, menu and newsletter.

Run locally:  python -m uvicorn backend.main:app --reload --port 8000
Interactive docs: http://localhost:8000/api/docs
"""

from __future__ import annotations

import hmac
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import booking
from .booking import BookingError
from .config import settings
from .db import get_session, init_db
from .menu import MENU
from .models import Reservation, Subscriber
from .schemas import (
    Availability,
    EmailIn,
    MenuItem,
    ReservationIn,
    ReservationOut,
    hhmm_to_minutes,
    minutes_to_hhmm,
)

# --------------------------------------------------------------------------- setup

_db_ready = False
_db_lock = threading.Lock()


def ensure_db() -> None:
    """Create tables on first use. (Serverless platforms don't always run lifespan hooks.)"""
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
    version="1.0.0",
    description="Reservations, availability, menu and newsletter for the Wildfern café.",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
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


@app.exception_handler(HTTPException)
async def _http_handler(_: Request, exc: HTTPException):
    return error(exc.status_code, str(exc.detail))


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
    )


def find_owned(session: Session, code: str, email: str) -> Reservation:
    r = session.scalar(select(Reservation).where(Reservation.code == code.strip().upper()))
    # Same response for "no such code" and "wrong email" so codes can't be probed.
    if r is None or not hmac.compare_digest(r.email, email.strip().lower()):
        raise HTTPException(status_code=404, detail="We couldn’t find a booking with that code and email.")
    return r


# --------------------------------------------------------------------------- routes


@app.get("/api/health")
def health(session: Session = Depends(db)):
    session.execute(select(1))
    return {
        "status": "ok",
        "database": "sqlite" if settings.is_sqlite else "postgres",
        "persistent": settings.is_persistent,
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
        if r.status != "cancelled":
            r.status = "cancelled"
            r.cancelled_at = datetime.now(timezone.utc)
    return to_out(r)


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


@app.get("/api/admin/reservations", response_model=list[ReservationOut])
def admin_reservations(
    day: date | None = Query(default=None, alias="date"),
    authorization: str = Header(default=""),
    session: Session = Depends(db),
):
    """Bookings for the café team. Requires `Authorization: Bearer <ADMIN_TOKEN>`."""
    token = authorization.removeprefix("Bearer ").strip()
    if not settings.admin_token or not hmac.compare_digest(token, settings.admin_token):
        raise HTTPException(status_code=401, detail="Not authorised.")
    q = select(Reservation).order_by(Reservation.date, Reservation.start_minute)
    if day:
        q = q.where(Reservation.date == day)
    return [to_out(r) for r in session.scalars(q)]
