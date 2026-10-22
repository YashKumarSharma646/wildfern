"""Owner dashboard, booking passes and door check-in."""

from datetime import timedelta

from sqlalchemy import inspect, text

from backend import passes
from backend.booking import cafe_now
from backend.db import Base, engine, init_db
from tests.test_api import book, client, day, fresh_state  # noqa: F401  (fixture is autouse)


def login():
    r = client.post("/api/admin/login", json={"password": "test-admin-token"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def today_iso():
    return cafe_now().date().isoformat()


def test_login_and_sessions():
    assert client.post("/api/admin/login", json={"password": "nope"}).status_code == 401
    h = login()
    assert client.get("/api/admin/summary", headers=h).status_code == 200
    tampered = {"Authorization": h["Authorization"][:-3] + "abc"}
    assert client.get("/api/admin/summary", headers=tampered).status_code == 401
    assert client.get("/api/admin/summary").status_code == 401


def test_old_table_gets_new_columns():
    # Simulate the production table as it was before this release.
    Base.metadata.drop_all(engine)
    with engine.begin() as c:
        c.execute(
            text(
                "CREATE TABLE reservations (id INTEGER PRIMARY KEY, code VARCHAR(12), name VARCHAR(80), "
                "email VARCHAR(254), date DATE, start_minute INTEGER, party_size INTEGER, status VARCHAR(16), "
                "created_at DATETIME, cancelled_at DATETIME)"
            )
        )
        c.execute(
            text(
                "INSERT INTO reservations (code,name,email,date,start_minute,party_size,status,created_at) "
                "VALUES ('WF-OLD234','Old Guest','old@example.com','2030-01-01',600,2,'confirmed','2026-01-01 10:00:00')"
            )
        )
    init_db()
    cols = {c["name"] for c in inspect(engine).get_columns("reservations")}
    assert {"source", "phone", "notes", "updated_at", "checked_in_at"} <= cols
    with engine.connect() as c:
        assert c.execute(text("SELECT source FROM reservations WHERE code='WF-OLD234'")).scalar() == "online"


def test_status_changes_and_capacity_restore():
    h = login()
    codes = [book(party_size=8).json()["code"] for _ in range(4)]
    r = client.patch(f"/api/admin/reservations/{codes[0]}", json={"status": "cancelled"}, headers=h)
    assert r.json()["status"] == "cancelled"
    assert book(party_size=8).status_code == 201  # the freed seats get taken...
    # ...so restoring the cancelled booking must be refused rather than overbook.
    assert client.patch(f"/api/admin/reservations/{codes[0]}", json={"status": "confirmed"}, headers=h).status_code == 409
    # A no-show frees seats too.
    assert client.patch(f"/api/admin/reservations/{codes[1]}", json={"status": "no_show"}, headers=h).status_code == 200
    assert book(party_size=8).status_code == 201


def test_walk_in_and_phone_bookings():
    h = login()
    w = client.post(
        "/api/admin/reservations",
        headers=h,
        json={"name": "Walk In", "date": today_iso(), "time": "07:00", "party_size": 3, "source": "walk-in"},
    )
    assert w.status_code == 201, w.text
    assert w.json()["status"] == "seated" and w.json()["checked_in_at"] and w.json()["source"] == "walk-in"
    p = client.post(
        "/api/admin/reservations",
        headers=h,
        json={"name": "Phone Guest", "phone": "555-0100", "date": day(3), "time": "12:00", "party_size": 12, "notes": "Birthday"},
    )
    assert p.status_code == 201 and p.json()["status"] == "confirmed" and p.json()["notes"] == "Birthday"
    found = client.get("/api/admin/reservations", params={"q": "555-0100"}, headers=h).json()
    assert [b["name"] for b in found] == ["Phone Guest"]


def test_summary_and_csv_exports():
    h = login()
    book(party_size=4)
    book(party_size=2, time="11:00")
    client.post("/api/newsletter", json={"email": "fern@example.com"})
    s = client.get("/api/admin/summary", params={"date": day()}, headers=h).json()
    assert s["day"]["bookings"] == 2 and s["day"]["covers"] == 6 and s["day"]["capacity"] == 32
    slot = {x["time"]: x for x in s["day"]["slots"]}
    assert slot["10:00"]["seats_used"] == 4 and slot["11:00"]["seats_used"] == 6  # 10:00 party still there at 11:00
    assert len(s["week"]) == 7 and s["subscribers"] == 1
    b = client.get("/api/admin/reservations.csv", headers=h)
    assert b.status_code == 200 and "text/csv" in b.headers["content-type"] and "Ada Fern" in b.text
    assert "fern@example.com" in client.get("/api/admin/subscribers.csv", headers=h).text


def test_pass_and_checkin_flow():
    h = login()
    b = client.post(
        "/api/admin/reservations",
        headers=h,
        json={"name": "Maya Linden", "email": "maya@example.com", "date": today_iso(), "time": "17:30", "party_size": 2},
    ).json()
    token = b["pass_token"]
    assert passes.verify_token(token) == b["code"]

    # The pass link works without the email and shows nothing private.
    pv = client.get(f"/api/pass/{token}").json()
    assert pv["name"] == "Maya Linden" and "email" not in pv
    assert client.get(f"/api/pass/{b['code']}.AAAAAAAAAAAAAAAAAAAAAA").status_code == 404

    # A forged signature is rejected; scanning the full pass URL checks the party in.
    forged = client.post("/api/admin/checkin", headers=h, json={"scan": f"{b['code']}.forgedforgedforgedforged"})
    assert forged.json()["result"] == "invalid"
    ok = client.post("/api/admin/checkin", headers=h, json={"scan": f"https://wildfern.vercel.app/pass/{token}"}).json()
    assert ok["result"] == "checked_in" and ok["booking"]["status"] == "seated", ok
    assert client.post("/api/admin/checkin", headers=h, json={"scan": token}).json()["result"] == "already_checked_in"

    # Another day's booking needs a deliberate "check in anyway".
    other = book(date=day(2)).json()
    nt = client.post("/api/admin/checkin", headers=h, json={"scan": other["pass_token"]}).json()
    assert nt["result"] == "not_today" and nt["can_force"]
    forced = client.post("/api/admin/checkin", headers=h, json={"scan": other["pass_token"], "force": True}).json()
    assert forced["result"] == "checked_in"

    # Cancelled bookings are flagged; staff can type a code; junk is invalid.
    c = book(time="15:00").json()
    client.post(f"/api/reservations/{c['code']}/cancel", json={"email": "ada@example.com"})
    assert client.post("/api/admin/checkin", headers=h, json={"scan": c["code"].lower()}).json()["result"] == "cancelled"
    assert client.post("/api/admin/checkin", headers=h, json={"scan": "hello world"}).json()["result"] == "invalid"


def test_guest_cannot_cancel_after_visit():
    h = login()
    r = book().json()
    client.patch(f"/api/admin/reservations/{r['code']}", json={"status": "seated"}, headers=h)
    assert client.post(f"/api/reservations/{r['code']}/cancel", json={"email": "ada@example.com"}).status_code == 409


def test_booking_window_still_enforced_for_staff():
    h = login()
    past = (cafe_now().date() - timedelta(days=1)).isoformat()
    r = client.post("/api/admin/reservations", headers=h, json={"name": "Too Late", "date": past, "time": "10:00", "party_size": 2})
    assert r.status_code == 422 and r.json()["field"] == "date"
