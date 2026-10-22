from datetime import timedelta

# The throwaway database and admin password are set up in conftest.py.
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend import main  # noqa: E402
from backend.booking import cafe_now  # noqa: E402
from backend.db import Base, engine  # noqa: E402

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def fresh_state():
    main.ensure_db()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    main._hits.clear()
    yield


def day(offset=7):
    return (cafe_now().date() + timedelta(days=offset)).isoformat()


def book(**over):
    body = {"name": "Ada Fern", "email": "ada@example.com", "date": day(), "time": "10:00", "party_size": 2}
    body.update(over)
    return client.post("/api/reservations", json=body)


def test_health_and_menu():
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["database"] == "sqlite"
    menu = client.get("/api/menu").json()
    assert [m["name"] for m in menu] == ["Forest Bloom", "Wildflower Latte", "Moss & Matcha"]


def test_create_and_lookup_reservation():
    r = book()
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["code"].startswith("WF-") and len(data["code"]) == 9
    assert data["status"] == "confirmed" and data["time"] == "10:00"

    found = client.get(f"/api/reservations/{data['code']}", params={"email": "ADA@example.com"})
    assert found.status_code == 200 and found.json()["name"] == "Ada Fern"
    # Wrong email looks exactly like a missing code.
    assert client.get(f"/api/reservations/{data['code']}", params={"email": "x@example.com"}).status_code == 404


def test_validation_messages_are_friendly():
    r = book(name="A", email="not-an-email", party_size=12)
    assert r.status_code == 422
    errs = r.json()["errors"]
    assert set(errs) >= {"name", "email", "party_size"}
    assert book(date=day(-1)).json()["field"] == "date"
    assert book(date=day(200)).json()["field"] == "date"
    assert book(time="10:15").json()["field"] == "time"
    assert book(time="21:00").json()["field"] == "time"


def test_capacity_and_overlapping_visits():
    for _ in range(4):  # 4 × 8 = all 32 bookable seats at 10:00
        assert book(party_size=8).status_code == 201
    full = book(party_size=1)
    assert full.status_code == 409 and full.json()["field"] == "time"
    # 10:30 overlaps the 90-minute visits that started at 10:00.
    assert book(time="10:30").status_code == 409
    # 11:30 is when those seats free up again.
    assert book(time="11:30").status_code == 201

    slots = {s["time"]: s for s in client.get("/api/availability", params={"date": day()}).json()["slots"]}
    assert slots["10:00"]["available"] is False and slots["10:00"]["seats_left"] == 0
    assert slots["09:00"]["seats_left"] == 0  # a 9:00 visit would run into 10:00
    assert slots["08:00"]["available"] is True


def test_cancel_frees_seats():
    codes = [book(party_size=8).json()["code"] for _ in range(4)]
    assert book().status_code == 409
    c = client.post(f"/api/reservations/{codes[0]}/cancel", json={"email": "ada@example.com"})
    assert c.status_code == 200 and c.json()["status"] == "cancelled"
    assert book(party_size=8).status_code == 201


def test_newsletter_is_idempotent():
    for _ in range(2):
        r = client.post("/api/newsletter", json={"email": "Leaf@Example.com"})
        assert r.status_code == 200 and r.json()["ok"] is True
    assert client.post("/api/newsletter", json={"email": "nope"}).status_code == 422


def test_admin_requires_token():
    book()
    assert client.get("/api/admin/reservations").status_code == 401
    ok = client.get("/api/admin/reservations", headers={"Authorization": "Bearer test-admin-token"})
    assert ok.status_code == 200 and len(ok.json()) == 1


def test_honeypot_and_rate_limit():
    assert book(website="http://spam.example").status_code == 400
    main._hits.clear()
    statuses = [book(time=t).status_code for t in ["07:00", "08:00", "09:00", "11:30", "13:00", "14:30", "16:00", "17:30", "12:00"]]
    assert statuses[:8] == [201] * 8 and statuses[8] == 429
