"""Database tables."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(254), index=True)
    date: Mapped[date] = mapped_column(Date)
    # Minutes after midnight (café local time), e.g. 630 = 10:30.
    start_minute: Mapped[int] = mapped_column(Integer)
    party_size: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="confirmed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_reservations_date_status", "date", "status"),)


class Subscriber(Base):
    __tablename__ = "subscribers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
