"""Signed booking passes.

A pass token is "<CODE>.<signature>". The signature is an HMAC of the booking code, so a
pass can't be guessed or forged from the short code alone. The QR on a guest's pass encodes
https://<site>/pass/<token>: any phone camera opens the pass, and the staff scanner verifies it.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re

from .config import settings

_TOKEN_RE = re.compile(r"(WF-[A-Z0-9]{6})\.([A-Za-z0-9_-]{16,})")
_CODE_RE = re.compile(r"^\s*(WF-?[A-Z0-9]{6})\s*$", re.I)


def _key() -> bytes:
    secret = settings.pass_secret or settings.admin_token or "wildfern-local-development-only"
    return hashlib.sha256(b"wildfern-pass:" + secret.encode()).digest()


def _sig(code: str) -> str:
    mac = hmac.new(_key(), code.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")[:22]  # 132 bits


def pass_token(code: str) -> str:
    return f"{code}.{_sig(code)}"


def verify_token(token: str) -> str | None:
    """Return the booking code if the token's signature is valid."""
    m = _TOKEN_RE.search(token or "")
    if not m:
        return None
    code, sig = m.group(1), m.group(2)
    return code if hmac.compare_digest(sig, _sig(code)) else None


def parse_scan(text: str) -> tuple[str | None, bool]:
    """Interpret whatever the scanner read: a pass URL, a bare token, or a typed code.
    Returns (code, signed). A typed code is accepted only from signed-in staff."""
    text = (text or "").strip()
    code = verify_token(text)
    if code:
        return code, True
    if _TOKEN_RE.search(text):
        return None, False  # looks like a pass but the signature is wrong → forged/altered
    m = _CODE_RE.match(text.upper())
    if m:
        c = m.group(1)
        return (c if c.startswith("WF-") else f"WF-{c[2:]}"), False
    return None, False
