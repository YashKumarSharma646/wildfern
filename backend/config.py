"""Runtime configuration, read once from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ON_VERCEL = bool(os.getenv("VERCEL"))


def _database_url() -> str:
    url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or ""
    if url:
        # Hosted providers (Neon, Vercel Postgres, Supabase) hand out postgres:// URLs;
        # SQLAlchemy needs the driver named explicitly.
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://") :]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://") :]
        return url
    if ON_VERCEL:
        # Serverless functions only have a writable, *temporary* /tmp. This keeps the API
        # working without a database, but data does not survive cold starts.
        return "sqlite:////tmp/wildfern.db"
    return f"sqlite:///{Path(__file__).resolve().parent.parent / 'wildfern.db'}"


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=_database_url)
    admin_token: str = field(default_factory=lambda: os.getenv("ADMIN_TOKEN", ""))
    # Comma-separated list; only needed when the frontend is served from another origin.
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip())
    )
    cafe_timezone: str = field(default_factory=lambda: os.getenv("CAFE_TIMEZONE", "UTC"))

    # Booking rules
    open_minute: int = 7 * 60  # 07:00
    last_seating_minute: int = 17 * 60 + 30  # 17:30
    slot_minutes: int = 30
    visit_minutes: int = 90  # how long a booking holds its seats
    bookable_seats: int = 32  # the rest of the room is kept for walk-ins
    max_party: int = 8
    booking_window_days: int = 90
    min_notice_minutes: int = 60

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_persistent(self) -> bool:
        return not (ON_VERCEL and self.is_sqlite)


settings = Settings()
