import pytest
from fastapi.testclient import TestClient

from app import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_meta(client):
    data = client.get("/meta").json()
    assert data["slots_per_day"] == 48
    assert "work" in data["categories"]
    assert "rest" in data["categories"]


def test_create_block(client):
    r = client.post("/blocks", json={
        "block_date": "2026-10-31",
        "slot_index": 18,
        "category": "work",
        "status": "done",
        "energy": 4,
    })
    assert r.status_code == 201
    data = r.json()
    assert data["slot_index"] == 18
    assert data["category"] == "work"


def test_duplicate_slot_returns_409(client):
    r = client.post("/blocks", json={
        "block_date": "2026-10-31",
        "slot_index": 18,
        "category": "rest",
    })
    assert r.status_code == 409


def test_invalid_slot(client):
    r = client.post("/blocks", json={
        "block_date": "2026-10-31",
        "slot_index": 48,
        "category": "work",
    })
    assert r.status_code == 422


def test_invalid_category(client):
    r = client.post("/blocks", json={
        "block_date": "2026-10-31",
        "slot_index": 20,
        "category": "cooking",
    })
    assert r.status_code == 422


def test_day_grid_has_48_slots(client):
    r = client.get("/days/2026-10-31")
    assert r.status_code == 200
    data = r.json()
    assert len(data["slots"]) == 48
    filled = [s for s in data["slots"] if s["block"] is not None]
    assert any(s["slot_index"] == 18 for s in filled)


def test_update_block(client):
    grid = client.get("/days/2026-10-31").json()
    block = next(s["block"] for s in grid["slots"] if s["block"])
    r = client.patch(f"/blocks/{block['id']}", json={"status": "skipped"})
    assert r.status_code == 200
    assert r.json()["status"] == "skipped"


def test_delete_block(client):
    grid = client.get("/days/2026-10-31").json()
    block = next(s["block"] for s in grid["slots"] if s["block"])
    r = client.delete(f"/blocks/{block['id']}")
    assert r.status_code == 204
    r2 = client.get(f"/blocks/by-slot/2026-10-31/{block['slot_index']}")
    assert r2.status_code == 404 