"""Request and response shapes for the public API."""

from __future__ import annotations

import re
from datetime import date

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def minutes_to_hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def hhmm_to_minutes(value: str) -> int:
    match = TIME_RE.match(value)
    if not match:
        raise ValueError("Time must look like HH:MM.")
    return int(match.group(1)) * 60 + int(match.group(2))


class ReservationIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    date: date
    time: str
    party_size: int = Field(ge=1, le=8)
    # Honeypot: real visitors never see or fill this field.
    website: str = Field(default="", max_length=200)

    @field_validator("time")
    @classmethod
    def _valid_time(cls, v: str) -> str:
        hhmm_to_minutes(v)
        return v


class ReservationOut(BaseModel):
    code: str
    name: str
    email: str
    date: date
    time: str
    party_size: int
    status: str


class EmailIn(BaseModel):
    email: EmailStr


class Slot(BaseModel):
    time: str
    available: bool
    seats_left: int


class Availability(BaseModel):
    date: date
    open: bool
    slots: list[Slot]


class MenuItem(BaseModel):
    id: str
    name: str
    description: str
    price: str
    notes: list[str]
    serve: str
    image: str
    alt: str
