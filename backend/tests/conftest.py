import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
import uuid
from datetime import datetime, timezone, timedelta

os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-pytest"
os.environ["ALGORITHM"] = "HS256"
os.environ["REFRESH_COOKIE_SECURE"] = "false"
os.environ["ENABLE_DEBUG_ROUTES"] = "true"

from app.main import app
from app.core.database import Base, get_db

TEST_EVENT_ID = uuid.UUID("a5555555-5555-5555-5555-555555555555")

if os.path.exists("test.db"):
    try: os.remove("test.db")
    except OSError: pass

TEST_DB_URL = "sqlite:///./test.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try: yield db
    finally: db.close()

app.dependency_overrides[get_db] = override_get_db

if hasattr(app.state, "limiter"):
    app.state.limiter.enabled = False

@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    from app.models import event, participant, evaluation, mentor, communication_log, risk
    from sqlalchemy.dialects.postgresql import JSONB, ARRAY
    from sqlalchemy.types import JSON
    
    for table_name, table in Base.metadata.tables.items():
        for col in table.columns:
            if isinstance(col.type, JSONB) or isinstance(col.type, ARRAY):
                col.type = JSON()
        indexes_to_remove = [idx for idx in table.indexes if "using" in getattr(idx, "dialect_options", {}).get("postgresql", {}) or "gin" in idx.name.lower()]
        for idx in indexes_to_remove: table.indexes.remove(idx)
            
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    from app.models.organization import Organization
    from app.models.user import User
    from app.models.organization_membership import OrganizationMembership
    from app.models.auth_tokens import UserSession
    from app.models.event import Event, EventStatus
    
    org_id = uuid.UUID("a1111111-1111-1111-1111-111111111111")
    user_id = uuid.UUID("a2222222-2222-2222-2222-222222222222")
    session_id = uuid.UUID("a3333333-3333-3333-3333-333333333333")
    
    org = Organization(id=org_id, name="Test Org", slug="test-org", is_active=True, created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
    user = User(id=user_id, first_name="Test", last_name="Admin", email="admin@test.com", password_hash="hash", email_verified=True, is_active=True, failed_login_attempts=0, token_version=1, created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
    membership = OrganizationMembership(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, role="owner", status="active", joined_at=datetime.now(timezone.utc), created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
    user_session = UserSession(id=session_id, user_id=user_id, refresh_token_hash="hash", token_family_id="fam", expires_at=datetime.now(timezone.utc) + timedelta(days=1), created_at=datetime.now(timezone.utc))
    
    # CLAUDE'S FIX: Inject the global event
    event = Event(
        id=TEST_EVENT_ID,
        organization_id=org_id,
        name="Test Event",
        slug="test-event",
        event_type="hackathon",
        active_capabilities=["teams", "mentors", "evaluators", "submissions", "weighted_scoring", "leaderboard"],
        status=EventStatus.ACTIVE,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    
    db.add_all([org, user, membership, user_session, event])
    from app.models.template import Template
    
    templates = [
        Template(key="generic_competitive_event", name="Generic Competitive Event", event_type_label="generic_competitive_event", version=1, is_system_template=True, default_capabilities=["teams", "evaluators", "submissions", "weighted_scoring"], suggested_stages=[], required_roles=[]),
        Template(key="hackathon", name="Hackathon", event_type_label="hackathon", version=1, is_system_template=True, default_capabilities=["teams", "mentors", "evaluators", "submissions", "weighted_scoring"], suggested_stages=[], required_roles=[]),
        Template(key="coding_contest", name="Coding Contest", event_type_label="coding_contest", version=1, is_system_template=True, default_capabilities=["submissions", "live_scoring", "evaluators", "leaderboard"], suggested_stages=[], required_roles=[]),
        Template(key="case_competition", name="Case Competition", event_type_label="case_competition", version=1, is_system_template=True, default_capabilities=["teams", "submissions", "presentation_evaluation", "evaluators", "weighted_scoring"], suggested_stages=[], required_roles=[]),
        Template(key="sports_tournament", name="Sports Tournament", event_type_label="sports_tournament", version=1, is_system_template=True, default_capabilities=["teams", "matches", "fixtures", "elimination", "live_scoring"], suggested_stages=[], required_roles=[]),
    ]
    db.add_all(templates)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="session")
def client():
    from app.services.token_service import TokenService
    token = TokenService.create_access_token(user_id="a2222222-2222-2222-2222-222222222222", session_id="a3333333-3333-3333-3333-333333333333", token_version=1, role="user")
    c = TestClient(app)
    # CLAUDE'S FIX INTEGRATED: Add X-Event-Id globally so tests don't 404
    c.headers.update({"Authorization": f"Bearer {token}", "X-Organization-Id": "a1111111-1111-1111-1111-111111111111", "X-Event-Id": str(TEST_EVENT_ID)})
    return c

@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try: yield db
    finally:
        db.rollback()
        db.close()

@pytest.fixture
def sample_event():
    class DummyEvent:
        id = TEST_EVENT_ID
    return DummyEvent()

@pytest.fixture
def sample_participant(db_session):
    from app.models.participant import Participant
    p = Participant(first_name="Priya", last_name="Sharma", email=f"priya.{uuid.uuid4().hex[:6]}@bits.ac.in", institution="BITS Pilani", skill_vector={"python": 7.0, "ml": 6.0}, event_id=TEST_EVENT_ID)
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p

@pytest.fixture
def sample_team(db_session):
    from app.models.participant import Team
    t = Team(team_name=f"Team Alpha {uuid.uuid4().hex[:6]}", rationale="Test", is_approved=False, event_id=TEST_EVENT_ID)
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return t

@pytest.fixture
def approved_team(db_session):
    from app.models.participant import Team
    t = Team(team_name=f"Team Beta {uuid.uuid4().hex[:6]}", rationale="Approved", is_approved=True, event_id=TEST_EVENT_ID)
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return t

@pytest.fixture
def sample_evaluator(db_session):
    from app.models.evaluation import Evaluator
    e = Evaluator(first_name="Dr. Meena", last_name="Sharma", email=f"meena.{uuid.uuid4().hex[:6]}@ti.com", expertise_areas=["embedded systems"], is_active=True, event_id=TEST_EVENT_ID)
    db_session.add(e)
    db_session.commit()
    db_session.refresh(e)
    return e

from unittest.mock import patch
@pytest.fixture(autouse=True)
def disable_external_services():
    class DummyAsyncResult:
        def __init__(self, id="mock_task_id_12345", *args, **kwargs):
            self.id = id
            self.state = "SUCCESS"
        def get(self, *args, **kwargs): return {"status": "ok"}
            
    with patch("celery.app.task.Task.delay", return_value=DummyAsyncResult()), \
         patch("celery.app.task.Task.apply_async", return_value=DummyAsyncResult()), \
         patch("celery.result.AsyncResult", DummyAsyncResult), \
         patch("redis.Redis"), \
         patch("redis.asyncio.Redis"):
        yield
