"""
Phase-6 automatic stage engine.

Verifies the roadmap exit conditions that are *new* in Phase 6 (the locking /
idempotency / cancel-regenerate ones are covered by Phase 4 tests):
  * automatic-policy stages auto-activate when their start time is due
  * manual-policy stages park in 'awaiting_approval' instead of activating
  * the committee approve endpoint releases a held stage
  * a grace period pushes the effective stage_end out
  * re-running the processor does not double-advance
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import sessionmaker

from app.models.event import Event, EventStatus
from app.models.scheduled_action import ScheduledAction
from app.models.stage_definition import StageDefinition
from app.models.stage_run import StageRun

TEST_ORG_ID = uuid.UUID("a1111111-1111-1111-1111-111111111111")


def _make_event(db, status=EventStatus.DRAFT) -> uuid.UUID:
    eid = uuid.uuid4()
    db.add(Event(
        id=eid, organization_id=TEST_ORG_ID, name="P6 Test",
        slug=f"p6-{eid}", event_type="hackathon",
        active_capabilities=[], configuration={}, status=status,
    ))
    db.commit()
    return eid


def _hdr(eid):
    return {"X-Event-Id": str(eid)}


def _create(client, eid, key, position, start, end, policy="automatic", **over):
    payload = {
        "key": key, "name": key.title(), "position": position,
        "start_at": start.isoformat(), "end_at": end.isoformat(),
        "timezone": "Asia/Kolkata", "transition_policy": policy,
    }
    payload.update(over)
    return client.post(f"/events/{eid}/stages", json=payload, headers=_hdr(eid))


def _run_engine(monkeypatch, db_session):
    TestSession = sessionmaker(bind=db_session.get_bind(), autocommit=False, autoflush=False)
    monkeypatch.setattr("app.tasks.stages.SessionLocal", TestSession)
    from app.tasks.stages import process_scheduled_actions
    return process_scheduled_actions()


@pytest.fixture
def past_now():
    # A start an hour in the past so stage_start is immediately due.
    now = datetime.now(timezone.utc)
    return now - timedelta(hours=1), now + timedelta(days=1)


def test_automatic_stage_auto_activates(client, db_session, monkeypatch, past_now):
    start, end = past_now
    eid = _make_event(db_session)
    _create(client, eid, "s1", 1, start, end, policy="automatic")
    assert client.post(f"/events/{eid}/publish", headers=_hdr(eid)).status_code == 200

    _run_engine(monkeypatch, db_session)

    db_session.expire_all()
    run = db_session.query(StageRun).filter(StageRun.event_id == eid).first()
    assert run.status == "active"

def test_generate_runs_for_live_event_schedules_due_automatic_stage(client, db_session, monkeypatch, past_now):
    start, end = past_now
    eid = _make_event(db_session, status=EventStatus.ACTIVE)
    _create(client, eid, "s1", 1, start, end, policy="automatic")

    r = client.post(f"/events/{eid}/stages/runs/generate", headers=_hdr(eid))
    assert r.status_code == 200, r.text
    assert r.json()["runs_created"] == 1
    assert r.json()["actions_scheduled"] >= 2

    _run_engine(monkeypatch, db_session)

    db_session.expire_all()
    run = db_session.query(StageRun).filter(StageRun.event_id == eid).first()
    assert run.status == "active"


def test_advance_run_endpoint_releases_awaiting_manual_stage(client, db_session, monkeypatch, past_now):
    start, end = past_now
    eid = _make_event(db_session)
    _create(client, eid, "s1", 1, start, end, policy="manual")
    assert client.post(f"/events/{eid}/publish", headers=_hdr(eid)).status_code == 200

    _run_engine(monkeypatch, db_session)

    db_session.expire_all()
    run = db_session.query(StageRun).filter(StageRun.event_id == eid).first()
    assert run.status == "awaiting_approval"

    r = client.post(f"/events/{eid}/stages/runs/advance", headers=_hdr(eid))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "active"

    db_session.expire_all()
    run = db_session.query(StageRun).filter(StageRun.event_id == eid).first()
    assert run.status == "active"


def test_stage_snapshot_keeps_all_stages_pending_before_start(client, db_session):
    from app.services.link_service import LinkService
    from app.services.stage_service import StageService

    now = datetime.now(timezone.utc)
    eid = _make_event(db_session, status=EventStatus.ACTIVE)
    _create(
        client,
        eid,
        "registration",
        1,
        now + timedelta(hours=1),
        now + timedelta(hours=2),
        policy="automatic",
    )

    StageService(db_session, eid).generate_stage_runs()

    snapshot = LinkService._stage_snapshot(eid, db_session)

    assert snapshot["current_stage"] == "not_started"
    assert snapshot["timeline"] == [
        {"phase": "Registration", "status": "pending"}
    ]


def test_manual_stage_holds_for_approval(client, db_session, monkeypatch, past_now):
    start, end = past_now
    eid = _make_event(db_session)
    _create(client, eid, "s1", 1, start, end, policy="manual")
    assert client.post(f"/events/{eid}/publish", headers=_hdr(eid)).status_code == 200

    _run_engine(monkeypatch, db_session)

    db_session.expire_all()
    run = db_session.query(StageRun).filter(StageRun.event_id == eid).first()
    assert run.status == "awaiting_approval"  # NOT active


def test_approve_releases_held_stage(client, db_session, monkeypatch, past_now):
    start, end = past_now
    eid = _make_event(db_session)
    resp = _create(client, eid, "s1", 1, start, end, policy="manual")
    stage_id = resp.json()["id"]
    assert client.post(f"/events/{eid}/publish", headers=_hdr(eid)).status_code == 200

    _run_engine(monkeypatch, db_session)

    # approve via the committee endpoint
    r = client.post(f"/events/{eid}/stages/{stage_id}/approve", headers=_hdr(eid))
    assert r.status_code == 200
    assert r.json()["status"] == "active"

    # approving again is a 409 (no longer awaiting_approval)
    r2 = client.post(f"/events/{eid}/stages/{stage_id}/approve", headers=_hdr(eid))
    assert r2.status_code == 409


def test_grace_period_shifts_stage_end(client, db_session, past_now):
    start, end = past_now
    eid = _make_event(db_session)
    _create(client, eid, "s1", 1, start, end, policy="automatic",
            reminder_policy={"grace_minutes": 30})
    assert client.post(f"/events/{eid}/publish", headers=_hdr(eid)).status_code == 200

    sd = db_session.query(StageDefinition).filter(StageDefinition.event_id == eid).first()
    end_action = db_session.query(ScheduledAction).filter(
        ScheduledAction.event_id == eid,
        ScheduledAction.action_type == "stage_end",
    ).first()
    assert end_action is not None
    assert end_action.payload.get("grace_minutes") == 30
    assert end_action.run_at > sd.end_at  # pushed out by the grace window


def test_engine_is_idempotent(client, db_session, monkeypatch, past_now):
    start, end = past_now
    eid = _make_event(db_session)
    _create(client, eid, "s1", 1, start, end, policy="manual")
    assert client.post(f"/events/{eid}/publish", headers=_hdr(eid)).status_code == 200

    first = _run_engine(monkeypatch, db_session)
    assert first["processed"] >= 1
    second = _run_engine(monkeypatch, db_session)
    assert second["claimed"] == 0  # nothing left due/pending

    db_session.expire_all()
    runs = db_session.query(StageRun).filter(StageRun.event_id == eid).all()
    assert len(runs) == 1 and runs[0].status == "awaiting_approval"