"""Request and response shapes for the public API."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

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
    # Signed token behind the QR booking pass (only ever returned to the booking's owner or staff).
    pass_token: str


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


# --------------------------------------------------------------------------- owner dashboard

Status = Literal["confirmed", "seated", "no_show", "cancelled"]


class LoginIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class AdminReservationOut(ReservationOut):
    source: str
    phone: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime | None
    checked_in_at: datetime | None


class PassOut(BaseModel):
    """What a pass link shows: enough to recognise the booking, nothing private."""

    code: str
    name: str
    date: date
    time: str
    party_size: int
    status: str


class CheckinIn(BaseModel):
    scan: str = Field(min_length=3, max_length=500)  # pass URL, token, or a typed code
    force: bool = False  # "check in anyway" for a different day / after a no-show


class CheckinOut(BaseModel):
    result: Literal["checked_in", "already_checked_in", "not_today", "cancelled", "invalid", "not_found"]
    message: str
    booking: AdminReservationOut | None = None
    can_force: bool = False


class StaffReservationIn(BaseModel):
    """A booking taken by the team (phone call or walk-in). Email is optional."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=80)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    date: date
    time: str
    party_size: int = Field(ge=1, le=16)
    source: Literal["phone", "walk-in"] = "phone"
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("time")
    @classmethod
    def _valid_time(cls, v: str) -> str:
        hhmm_to_minutes(v)
        return v

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email(cls, v):
        return v or None


class StatusIn(BaseModel):
    status: Status


class SubscriberOut(BaseModel):
    email: str
    created_at: datetime
