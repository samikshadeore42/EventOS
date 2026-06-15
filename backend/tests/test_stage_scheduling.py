"""
Phase-4 negative / validation / Hard-Gate coverage.

Complements tests/test_phase4_stages.py (the happy path). Everything here drives
the real API via the `client` fixture, creating its own draft events under the
seeded test org so tests don't collide on the unique (event_id, position/key)
constraints.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.event import Event, EventStatus
from app.models.stage_run import StageRun
from app.models.stage_transition import StageTransition

# Seeded in conftest.setup_test_database
TEST_ORG_ID = uuid.UUID("a1111111-1111-1111-1111-111111111111")
TEST_EVENT_ID = uuid.UUID("a5555555-5555-5555-5555-555555555555")  # status=ACTIVE


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_event(db, status=EventStatus.DRAFT) -> uuid.UUID:
    eid = uuid.uuid4()
    ev = Event(
        id=eid, organization_id=TEST_ORG_ID, name="P4 Test",
        slug=f"p4-{eid}", event_type="hackathon",
        active_capabilities=[], configuration={}, status=status,
    )
    db.add(ev)
    db.commit()
    return eid


def _hdr(eid: uuid.UUID) -> dict:
    return {"X-Event-Id": str(eid)}


def _payload(key, position, start, end, **over) -> dict:
    p = {
        "key": key, "name": key.title(), "position": position,
        "start_at": start.isoformat(), "end_at": end.isoformat(),
        "timezone": "Asia/Kolkata", "transition_policy": "manual",
    }
    p.update(over)
    return p


def _create(client, eid, *args, **kw):
    return client.post(f"/events/{eid}/stages", json=_payload(*args, **kw), headers=_hdr(eid))


@pytest.fixture
def now():
    return datetime.now(timezone.utc)


# ── per-field validation (schema layer → clean 422) ──────────────────────────

def test_create_rejects_invalid_timezone(client, db_session, now):
    eid = _make_event(db_session)
    r = _create(client, eid, "reg", 1, now, now + timedelta(days=1), timezone="Mars/Phobos")
    assert r.status_code == 422


def test_create_rejects_end_before_start(client, db_session, now):
    eid = _make_event(db_session)
    r = _create(client, eid, "reg", 1, now, now - timedelta(hours=1))
    assert r.status_code == 422


def test_create_rejects_zero_position(client, db_session, now):
    eid = _make_event(db_session)
    r = _create(client, eid, "reg", 0, now, now + timedelta(days=1))
    assert r.status_code == 422


# ── uniqueness (DB constraint → translated to 422, not 500) ──────────────────

def test_duplicate_position_returns_422(client, db_session, now):
    eid = _make_event(db_session)
    assert _create(client, eid, "a", 1, now, now + timedelta(days=1)).status_code == 201
    r = _create(client, eid, "b", 1, now + timedelta(days=2), now + timedelta(days=3))
    assert r.status_code == 422


def test_duplicate_key_returns_422(client, db_session, now):
    eid = _make_event(db_session)
    assert _create(client, eid, "dup", 1, now, now + timedelta(days=1)).status_code == 201
    r = _create(client, eid, "dup", 2, now + timedelta(days=2), now + timedelta(days=3))
    assert r.status_code == 422


# ── cross-stage validation (validate_schedule) ───────────────────────────────

def test_validation_detects_overlap(client, db_session, now):
    eid = _make_event(db_session)
    _create(client, eid, "s1", 1, now, now + timedelta(days=2))
    _create(client, eid, "s2", 2, now + timedelta(days=1), now + timedelta(days=3))  # overlaps s1
    r = client.get(f"/events/{eid}/stages/validation", headers=_hdr(eid))
    assert r.status_code == 200
    body = r.json()
    assert body["is_valid"] is False
    assert any(v["code"] == "stage_overlap" for v in body["violations"])


def test_validation_clean_schedule(client, db_session, now):
    eid = _make_event(db_session)
    _create(client, eid, "s1", 1, now, now + timedelta(days=1))
    _create(client, eid, "s2", 2, now + timedelta(days=1), now + timedelta(days=2))  # touches boundary
    r = client.get(f"/events/{eid}/stages/validation", headers=_hdr(eid))
    body = r.json()
    assert body["is_valid"] is True
    assert body["violations"] == []
    assert body["stage_count"] == 2


def test_validation_empty_event_is_invalid(client, db_session):
    eid = _make_event(db_session)
    r = client.get(f"/events/{eid}/stages/validation", headers=_hdr(eid))
    body = r.json()
    assert body["is_valid"] is False
    assert any(v["code"] == "no_stages" for v in body["violations"])


# ── reorder ──────────────────────────────────────────────────────────────────

def test_reorder_happy_path(client, db_session, now):
    eid = _make_event(db_session)
    ids = []
    for i, k in enumerate(["a", "b", "c"], start=1):
        resp = _create(client, eid, k, i, now + timedelta(days=i), now + timedelta(days=i, hours=1))
        ids.append(resp.json()["id"])

    r = client.post(f"/events/{eid}/stages/reorder",
                    json={"ordered_ids": list(reversed(ids))}, headers=_hdr(eid))
    assert r.status_code == 200
    pos = {s["id"]: s["position"] for s in r.json()}
    assert pos[ids[2]] == 1 and pos[ids[1]] == 2 and pos[ids[0]] == 3


def test_reorder_rejects_wrong_set(client, db_session, now):
    eid = _make_event(db_session)
    _create(client, eid, "a", 1, now, now + timedelta(days=1))
    r = client.post(f"/events/{eid}/stages/reorder",
                    json={"ordered_ids": [str(uuid.uuid4())]}, headers=_hdr(eid))
    assert r.status_code == 422


# ── the Hard Gate ────────────────────────────────────────────────────────────

def test_publish_blocked_on_invalid_schedule(client, db_session, now):
    eid = _make_event(db_session, EventStatus.DRAFT)
    _create(client, eid, "s1", 1, now, now + timedelta(days=2))
    _create(client, eid, "s2", 2, now + timedelta(days=1), now + timedelta(days=3))  # overlap

    r = client.post(f"/events/{eid}/publish", headers=_hdr(eid))
    assert r.status_code == 422
    assert "violations" in r.json()["detail"]

    # nothing was mutated: still draft, no runs materialised
    db_session.expire_all()
    assert db_session.get(Event, eid).status == EventStatus.DRAFT
    assert db_session.query(StageRun).filter(StageRun.event_id == eid).count() == 0


def test_publish_succeeds_and_materialises(client, db_session, now):
    eid = _make_event(db_session, EventStatus.DRAFT)
    _create(client, eid, "s1", 1, now - timedelta(hours=1), now + timedelta(days=1),
            reminder_policy={"warn_before_minutes": [60]})

    r = client.post(f"/events/{eid}/publish", headers=_hdr(eid))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == EventStatus.PUBLISHED
    assert body["runs_created"] == 1
    assert body["actions_scheduled"] >= 2  # stage_start + stage_end (+ warning)

    db_session.expire_all()
    assert db_session.get(Event, eid).status == EventStatus.PUBLISHED
    # audit trail written
    assert db_session.query(StageTransition).filter(
        StageTransition.event_id == eid,
        StageTransition.transition_type == "publish",
    ).count() == 1


def test_publish_rejected_when_not_draft(client):
    # TEST_EVENT_ID is seeded as ACTIVE → publishing is a 409 conflict.
    r = client.post(f"/events/{TEST_EVENT_ID}/publish", headers=_hdr(TEST_EVENT_ID))
    assert r.status_code == 409


# ── scheduled-action processor (Celery task, run synchronously) ──────────────

def test_scheduled_actions_processed(client, db_session, monkeypatch, now):
    eid = _make_event(db_session, EventStatus.DRAFT)
    # start_at in the past → its stage_start action is immediately due.
    _create(client, eid, "s1", 1, now - timedelta(hours=2), now + timedelta(days=1))
    assert client.post(f"/events/{eid}/publish", headers=_hdr(eid)).status_code == 200

    # Point the task's SessionLocal at the SQLite test engine.
    from sqlalchemy.orm import sessionmaker
    TestSession = sessionmaker(bind=db_session.get_bind(), autocommit=False, autoflush=False)
    monkeypatch.setattr("app.tasks.stages.SessionLocal", TestSession)

    from app.tasks.stages import process_scheduled_actions
    result = process_scheduled_actions()
    assert result["processed"] >= 1

    # the due stage_start fired → the stage's run is now active
    db_session.expire_all()
    run = db_session.query(StageRun).filter(StageRun.event_id == eid).first()
    assert run is not None and run.status == "active"