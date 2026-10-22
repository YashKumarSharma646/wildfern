"""Database engine, session handling and schema creation."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import ON_VERCEL, settings


class Base(DeclarativeBase):
    pass


def _make_engine(url: str):
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _):  # pragma: no cover - trivial
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        return engine
    # Serverless instances are short-lived and frozen between requests: don't keep
    # pooled connections around to go stale. Long-running servers can pool normally.
    if ON_VERCEL:
        return create_engine(url, poolclass=NullPool)
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)


engine = _make_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    # Import models so they register on Base.metadata before create_all.
    from . import models  # noqa: F401

    Base.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
