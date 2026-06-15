import uuid
from datetime import datetime, timedelta, timezone
from app.models.event import Event
from app.models.stage_definition import StageDefinition
from app.models.stage_run import StageRun
from app.services.stage_service import StageService

def test_create_and_generate_stage_runs(db_session):
    # Setup
    from app.models.organization import Organization
    org_id = uuid.uuid4()
    org = Organization(id=org_id, name="Test Org", slug=f"test-org-{org_id}", is_active=True)
    db_session.add(org)

    event_id = uuid.uuid4()
    event = Event(id=event_id, organization_id=org_id, name="Test Event", slug=f"test-stages-{event_id}", event_type="hackathon", active_capabilities=[])
    db_session.add(event)
    db_session.commit()

    svc = StageService(db_session, event_id)

    # Create stage definition
    stage_data = {
        "key": "registration",
        "name": "Registration",
        "position": 1,
        "start_at": datetime.now(timezone.utc),
        "end_at": datetime.now(timezone.utc) + timedelta(days=7),
        "transition_policy": "manual",
    }
    svc.create_stage_definition(stage_data)

    defs = svc.list_stage_definitions()
    assert len(defs) == 1

    # Generate runs
    svc.generate_stage_runs()
    runs = svc.list_stage_runs()
    assert len(runs) == 1
    assert runs[0].status == "pending"

    # Advance
    svc.advance_stage(defs[0].id)
    runs = svc.list_stage_runs()
    assert runs[0].status == "active"
