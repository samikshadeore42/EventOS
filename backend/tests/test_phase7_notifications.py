import uuid

from sqlalchemy.orm import sessionmaker

from app.models.notification import InAppNotification
from app.models.notification_outbox import NotificationOutbox
from app.services.notification_service import NotificationService
from tests.conftest import TEST_EVENT_ID


def test_notification_enqueue_is_idempotent(db_session):
    svc = NotificationService(db_session, TEST_EVENT_ID)

    first = svc.enqueue(
        "stage_started",
        "Stage started",
        "Development has started.",
        role="owner",
        idempotency_key="phase7-idem-1",
    )
    second = svc.enqueue(
        "stage_started",
        "Stage started",
        "Development has started.",
        role="owner",
        idempotency_key="phase7-idem-1",
    )

    assert first.id == second.id
    assert db_session.query(NotificationOutbox).filter(
        NotificationOutbox.event_id == TEST_EVENT_ID,
        NotificationOutbox.idempotency_key == "phase7-idem-1",
    ).count() == 1


def test_process_notification_outbox_creates_inapp(client, db_session, monkeypatch):
    svc = NotificationService(db_session, TEST_EVENT_ID)
    row = svc.enqueue(
        "stage_started",
        "Stage started",
        "Development has started.",
        role="owner",
        idempotency_key="phase7-process-1",
    )

    TestSession = sessionmaker(bind=db_session.get_bind(), autocommit=False, autoflush=False)
    monkeypatch.setattr("app.tasks.notifications.SessionLocal", TestSession)
    monkeypatch.setattr("app.services.email_service.EmailService.send_email", lambda **kwargs: True)

    from app.tasks.notifications import process_notification_outbox

    result = process_notification_outbox()
    assert result["claimed"] >= 1

    db_session.expire_all()
    refreshed = db_session.get(NotificationOutbox, row.id)
    assert refreshed.status == "delivered"

    assert db_session.query(InAppNotification).filter(
        InAppNotification.event_id == TEST_EVENT_ID,
        InAppNotification.notification_type == "stage_started",
    ).count() >= 1


def test_notification_api_list_count_and_mark_read(client, db_session):
    user_id = uuid.UUID("a2222222-2222-2222-2222-222222222222")

    notif = InAppNotification(
        event_id=TEST_EVENT_ID,
        user_id=user_id,
        title="Unread test",
        message="Read me",
        notification_type="test",
    )
    db_session.add(notif)
    db_session.commit()
    db_session.refresh(notif)

    count_resp = client.get(f"/events/{TEST_EVENT_ID}/notifications/unread-count")
    assert count_resp.status_code == 200
    assert count_resp.json()["unread"] >= 1

    list_resp = client.get(f"/events/{TEST_EVENT_ID}/notifications")
    assert list_resp.status_code == 200
    assert any(item["id"] == str(notif.id) for item in list_resp.json())

    read_resp = client.post(f"/events/{TEST_EVENT_ID}/notifications/{notif.id}/read")
    assert read_resp.status_code == 200
    assert read_resp.json()["read"] is True
