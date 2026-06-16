import pytest
import io
import uuid
from tests.conftest import TEST_EVENT_ID

def test_mentor_template(client):
    res = client.get(f"/events/{TEST_EVENT_ID}/mentors/csv-template")
    assert res.status_code == 200
    assert "first_name,last_name,email,organization,expertise_areas" in res.text

def test_evaluator_template(client):
    res = client.get(f"/events/{TEST_EVENT_ID}/evaluators/csv-template")
    assert res.status_code == 200
    assert "first_name,last_name,email,passed_out_institution,expertise_areas" in res.text

def test_mentor_import_creates_rows(client, db_session):
    csv_content = b"first_name,last_name,email,organization,expertise_areas\nAlice,A,alice@test.com,Org1,AI;ML\n"
    files = {"file": ("mentors.csv", io.BytesIO(csv_content), "text/csv")}
    res = client.post(f"/events/{TEST_EVENT_ID}/mentors/import?upsert=false", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["created"] == 1
    assert data["errors"] == 0

def test_evaluator_import_creates_rows(client, db_session):
    csv_content = b"first_name,last_name,email,passed_out_institution,expertise_areas\nBob,B,bob@test.com,Inst1,Security\n"
    files = {"file": ("evaluators.csv", io.BytesIO(csv_content), "text/csv")}
    res = client.post(f"/events/{TEST_EVENT_ID}/evaluators/import?upsert=false", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["created"] == 1
    assert data["errors"] == 0

def test_duplicate_email_in_same_csv_returns_row_error(client):
    csv_content = b"first_name,last_name,email,organization,expertise_areas\nC,C,dup@test.com,O1,AI\nD,D,dup@test.com,O2,ML\n"
    files = {"file": ("mentors.csv", io.BytesIO(csv_content), "text/csv")}
    res = client.post(f"/events/{TEST_EVENT_ID}/mentors/import?upsert=false", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["created"] == 1
    assert data["errors"] == 1

def test_duplicate_existing_email_fails_when_upsert_false(client):
    # First import
    csv_content = b"first_name,last_name,email,organization,expertise_areas\nE,E,exist@test.com,O1,AI\n"
    client.post(f"/events/{TEST_EVENT_ID}/mentors/import?upsert=false", files={"file": ("m.csv", io.BytesIO(csv_content), "text/csv")})
    
    # Second import without upsert
    csv_content2 = b"first_name,last_name,email,organization,expertise_areas\nE,E,exist@test.com,O2,ML\n"
    res = client.post(f"/events/{TEST_EVENT_ID}/mentors/import?upsert=false", files={"file": ("m2.csv", io.BytesIO(csv_content2), "text/csv")})
    assert res.status_code == 200
    assert res.json()["errors"] == 1
    assert res.json()["created"] == 0
    assert res.json()["updated"] == 0

def test_duplicate_existing_email_updates_when_upsert_true(client):
    # First import
    csv_content = b"first_name,last_name,email,organization,expertise_areas\nF,F,upd@test.com,O1,AI\n"
    client.post(f"/events/{TEST_EVENT_ID}/mentors/import?upsert=false", files={"file": ("m.csv", io.BytesIO(csv_content), "text/csv")})
    
    # Second import with upsert=true
    csv_content2 = b"first_name,last_name,email,organization,expertise_areas\nF,F,upd@test.com,O2,ML\n"
    res = client.post(f"/events/{TEST_EVENT_ID}/mentors/import?upsert=true", files={"file": ("m2.csv", io.BytesIO(csv_content2), "text/csv")})
    assert res.status_code == 200
    assert res.json()["errors"] == 0
    assert res.json()["updated"] == 1

def test_same_email_allowed_in_different_events(client, db_session):
    # Create another event
    from app.models.event import Event, EventStatus
    event2_id = uuid.uuid4()
    org_id = uuid.UUID("a1111111-1111-1111-1111-111111111111")
    event2 = Event(id=event2_id, organization_id=org_id, name="Event 2", slug="event-2", event_type="hackathon", active_capabilities=["mentors"], status=EventStatus.ACTIVE, is_legacy=False)
    db_session.add(event2)
    db_session.commit()

    csv_content = b"first_name,last_name,email,organization,expertise_areas\nG,G,cross@test.com,O1,AI\n"
    
    res1 = client.post(f"/events/{TEST_EVENT_ID}/mentors/import?upsert=false", files={"file": ("m.csv", io.BytesIO(csv_content), "text/csv")})
    assert res1.status_code == 200
    assert res1.json()["created"] == 1

    # Ensure to pass the correct event ID in headers for scope validator
    client.headers.update({"X-Event-Id": str(event2_id)})
    res2 = client.post(f"/events/{event2_id}/mentors/import?upsert=false", files={"file": ("m.csv", io.BytesIO(csv_content), "text/csv")})
    assert res2.status_code == 200
    assert res2.json()["created"] == 1

    # Reset header
    client.headers.update({"X-Event-Id": str(TEST_EVENT_ID)})

def test_export_returns_only_current_event_rows(client, db_session):
    from app.models.event import Event, EventStatus

    event2_id = uuid.uuid4()
    org_id = uuid.UUID("a1111111-1111-1111-1111-111111111111")

    event2 = Event(
        id=event2_id,
        organization_id=org_id,
        name="Export Isolation Event",
        slug=f"export-isolation-{event2_id}",
        event_type="hackathon",
        active_capabilities=["mentors"],
        status=EventStatus.ACTIVE,
        is_legacy=False,
    )
    db_session.add(event2)
    db_session.commit()

    current_csv = b"first_name,last_name,email,organization,expertise_areas\nCurrent,Event,current-export@test.com,O1,AI\n"
    other_csv = b"first_name,last_name,email,organization,expertise_areas\nOther,Event,other-export@test.com,O2,ML\n"

    client.headers.update({"X-Event-Id": str(TEST_EVENT_ID)})
    res1 = client.post(
        f"/events/{TEST_EVENT_ID}/mentors/import?upsert=false",
        files={"file": ("current.csv", io.BytesIO(current_csv), "text/csv")},
    )
    assert res1.status_code == 200

    client.headers.update({"X-Event-Id": str(event2_id)})
    res2 = client.post(
        f"/events/{event2_id}/mentors/import?upsert=false",
        files={"file": ("other.csv", io.BytesIO(other_csv), "text/csv")},
    )
    assert res2.status_code == 200

    client.headers.update({"X-Event-Id": str(TEST_EVENT_ID)})
    res = client.get(f"/events/{TEST_EVENT_ID}/mentors/export")

    assert res.status_code == 200
    assert "current-export@test.com" in res.text
    assert "other-export@test.com" not in res.text

def test_disabled_mentors_capability_blocks_mentor_import(client, db_session):
    from app.models.event import Event, EventStatus
    event3_id = uuid.uuid4()
    org_id = uuid.UUID("a1111111-1111-1111-1111-111111111111")
    event3 = Event(id=event3_id, organization_id=org_id, name="Event 3", slug="event-3", event_type="hackathon", active_capabilities=[], status=EventStatus.ACTIVE, is_legacy=False)
    db_session.add(event3)
    db_session.commit()

    client.headers.update({"X-Event-Id": str(event3_id)})
    csv_content = b"first_name,last_name,email,organization,expertise_areas\nH,H,block@test.com,O1,AI\n"
    res = client.post(f"/events/{event3_id}/mentors/import?upsert=false", files={"file": ("m.csv", io.BytesIO(csv_content), "text/csv")})
    assert res.status_code == 403
    assert "does not enable capability: mentors" in res.json()["detail"]

    client.headers.update({"X-Event-Id": str(TEST_EVENT_ID)})

def test_disabled_evaluators_capability_blocks_evaluator_import(client, db_session):
    from app.models.event import Event, EventStatus
    event4_id = uuid.uuid4()
    org_id = uuid.UUID("a1111111-1111-1111-1111-111111111111")
    event4 = Event(id=event4_id, organization_id=org_id, name="Event 4", slug="event-4", event_type="hackathon", active_capabilities=[], status=EventStatus.ACTIVE, is_legacy=False)
    db_session.add(event4)
    db_session.commit()

    client.headers.update({"X-Event-Id": str(event4_id)})
    csv_content = b"first_name,last_name,email,passed_out_institution,expertise_areas\nI,I,block2@test.com,Inst1,AI\n"
    res = client.post(f"/events/{event4_id}/evaluators/import?upsert=false", files={"file": ("m.csv", io.BytesIO(csv_content), "text/csv")})
    assert res.status_code == 403
    assert "does not enable capability: evaluators" in res.json()["detail"]

    client.headers.update({"X-Event-Id": str(TEST_EVENT_ID)})

def test_invalid_email_returns_row_error(client):
    csv_content = b"first_name,last_name,email,organization,expertise_areas\nBad,Email,not-an-email,Org,AI\n"

    res = client.post(
        f"/events/{TEST_EVENT_ID}/mentors/import?upsert=false",
        files={"file": ("bad.csv", io.BytesIO(csv_content), "text/csv")},
    )

    assert res.status_code == 200
    assert res.json()["errors"] == 1
    assert "Invalid email format" in res.json()["results"][0]["message"]


def test_large_csv_rejected(client):
    content = (
        b"first_name,last_name,email,organization,expertise_areas\n"
        + b"a" * (5 * 1024 * 1024 + 1)
    )

    res = client.post(
        f"/events/{TEST_EVENT_ID}/mentors/import?upsert=false",
        files={"file": ("large.csv", io.BytesIO(content), "text/csv")},
    )

    assert res.status_code == 413
