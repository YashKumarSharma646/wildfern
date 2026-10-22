"""Optional email notifications via Resend's HTTP API.

Nothing is sent unless RESEND_API_KEY is configured. Sending is best-effort with a short
timeout: an email problem must never stop a booking from being made or cancelled.
"""

from __future__ import annotations

import json
import logging
import urllib.request
from html import escape

from .config import settings
from .models import Reservation
from .schemas import minutes_to_hhmm

log = logging.getLogger("wildfern.notify")


def _send(to: str, subject: str, text: str, html: str) -> bool:
    if not settings.resend_api_key or not to:
        return False
    body = json.dumps({"from": settings.email_from, "to": [to], "subject": subject, "text": text, "html": html}).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=body,
        headers={"Authorization": f"Bearer {settings.resend_api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=4) as res:
            return 200 <= res.status < 300
    except Exception as exc:  # noqa: BLE001 — never let email break a booking
        log.warning("email to %s failed: %s", to, exc)
        return False


def _details(r: Reservation) -> list[tuple[str, str]]:
    return [
        ("Code", r.code),
        ("Name", r.name),
        ("Date", r.date.strftime("%A %d %B %Y")),
        ("Time", minutes_to_hhmm(r.start_minute)),
        ("Guests", str(r.party_size)),
        ("Email", r.email or "—"),
    ]


def _html(title: str, intro: str, rows: list[tuple[str, str]]) -> str:
    cells = "".join(
        f"<tr><td style='padding:4px 16px 4px 0;color:#6b6b6b'>{escape(k)}</td><td style='padding:4px 0'>{escape(v)}</td></tr>"
        for k, v in rows
    )
    return (
        "<div style='font-family:Georgia,serif;color:#16211a;max-width:520px'>"
        f"<h2 style='font-weight:400'>{escape(title)}</h2><p>{escape(intro)}</p>"
        f"<table style='font-family:Arial,sans-serif;font-size:14px'>{cells}</table></div>"
    )


def _text(intro: str, rows: list[tuple[str, str]]) -> str:
    return intro + "\n\n" + "\n".join(f"{k}: {v}" for k, v in rows)


def booking_created(r: Reservation) -> None:
    rows = _details(r)
    if settings.notify_email:
        intro = f"New {r.source} booking for {r.party_size} on {r.date:%a %d %b} at {minutes_to_hhmm(r.start_minute)}."
        _send(settings.notify_email, f"New booking · {r.name} · {r.party_size} guests", _text(intro, rows), _html("New booking", intro, rows))
    if settings.send_guest_emails and r.email:
        intro = "Your table at Wildfern is reserved. Keep your booking code — with your email it lets you look up or cancel your booking."
        _send(r.email, f"Your Wildfern table · {r.code}", _text(intro, rows), _html("See you soon in the forest", intro, rows))


def booking_cancelled(r: Reservation) -> None:
    if settings.notify_email:
        rows = _details(r)
        intro = f"{r.name} cancelled their booking for {r.party_size} on {r.date:%a %d %b} at {minutes_to_hhmm(r.start_minute)}."
        _send(settings.notify_email, f"Cancelled · {r.name} · {r.code}", _text(intro, rows), _html("Booking cancelled", intro, rows))
