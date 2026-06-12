import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import Base, get_db

TEST_DB_URL = "sqlite:///./test.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Override DB dependency for all tests
app.dependency_overrides[get_db] = override_get_db

# Disable rate limiter for testing
if hasattr(app.state, "limiter"):
    app.state.limiter.enabled = False


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Create all tables once per test session, drop after."""
    # Import all models so SQLAlchemy registers them
    from app.models import participant, evaluation, mentor, communication_log  # noqa: F401
    from sqlalchemy.dialects.postgresql import JSONB, ARRAY
    from sqlalchemy.types import JSON
    
    # Remove PostgreSQL-specific indexes and types that break SQLite compilation
    for table_name, table in Base.metadata.tables.items():
        # Convert PostgreSQL types to SQLite compatible types
        for col in table.columns:
            if isinstance(col.type, JSONB) or isinstance(col.type, ARRAY):
                col.type = JSON()
                
        # Remove PostgreSQL-specific indexes
        indexes_to_remove = [idx for idx in table.indexes if "using" in getattr(idx, "dialect_options", {}).get("postgresql", {})]
        # Also catch name-based if the above doesn't work
        indexes_to_remove += [idx for idx in table.indexes if "gin" in idx.name.lower() and idx not in indexes_to_remove]
        for idx in indexes_to_remove:
            table.indexes.remove(idx)
            
    Base.metadata.create_all(bind=engine)
    
    # Create a global test admin and organization
    db = TestingSessionLocal()
    from app.models.organization import Organization
    from app.models.user import User
    from app.models.organization_membership import OrganizationMembership
    import uuid
    from datetime import datetime, timezone, timedelta
    
    from app.models.auth_tokens import UserSession
    from app.services.token_service import TokenService
    
    # Use fixed UUIDs so we can reference them in the client fixture
    org_id = uuid.UUID("a1111111-1111-1111-1111-111111111111")
    user_id = uuid.UUID("a2222222-2222-2222-2222-222222222222")
    session_id = uuid.UUID("a3333333-3333-3333-3333-333333333333")
    
    org = Organization(id=org_id, name="Test Org", slug="test-org", is_active=True, created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
    user = User(id=user_id, first_name="Test", last_name="Admin", email="admin@test.com", password_hash="hash", email_verified=True, is_active=True, failed_login_attempts=0, token_version=1, created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
    membership = OrganizationMembership(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, role="owner", status="active", joined_at=datetime.now(timezone.utc), created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
    user_session = UserSession(id=session_id, user_id=user_id, refresh_token_hash="hash", token_family_id="fam", expires_at=datetime.now(timezone.utc) + timedelta(days=1), created_at=datetime.now(timezone.utc))
    
    db.add(org)
    db.add(user)
    db.add(membership)
    db.add(user_session)
    db.commit()
    db.close()
    
    yield
    Base.metadata.drop_all(bind=engine)
    import os
    if os.path.exists("test.db"):
        os.remove("test.db")


@pytest.fixture(scope="session")
def client():
    """Shared TestClient — one instance for the full session, with admin auth headers."""
    from app.services.token_service import TokenService
    # Create token for the test admin created in setup_test_database
    token = TokenService.create_access_token(
        user_id="a2222222-2222-2222-2222-222222222222",
        session_id="a3333333-3333-3333-3333-333333333333",
        token_version=1,
        role="user"
    )
    c = TestClient(app)
    c.headers.update({
        "Authorization": f"Bearer {token}",
        "X-Organization-Id": "a1111111-1111-1111-1111-111111111111"
    })
    return c


@pytest.fixture
def db_session():
    """Fresh DB session per test, rolled back after."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


@pytest.fixture
def sample_participant(db_session):
    """Creates and returns a real participant in the test DB."""
    from app.models.participant import Participant
    p = Participant(
        first_name="Priya",
        last_name="Sharma",
        email="priya.test@bits.ac.in",
        institution="BITS Pilani",
        skill_vector={"python": 7.0, "ml": 6.0, "frontend": 8.5, "embedded": 3.0}
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    yield p
    db_session.delete(p)
    db_session.commit()


@pytest.fixture
def sample_team(db_session):
    """Creates and returns a real team in the test DB."""
    from app.models.participant import Team
    t = Team(team_name="Team Alpha", rationale="Test team", is_approved=False)
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    yield t
    db_session.delete(t)
    db_session.commit()


@pytest.fixture
def approved_team(db_session):
    """Creates and returns an approved team."""
    from app.models.participant import Team
    t = Team(team_name="Team Beta", rationale="Approved team", is_approved=True)
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    yield t
    db_session.delete(t)
    db_session.commit()


@pytest.fixture
def sample_evaluator(db_session):
    """Creates and returns a real evaluator."""
    from app.models.evaluation import Evaluator
    e = Evaluator(
        first_name="Dr. Meena",
        last_name="Sharma",
        email="meena.test@ti.com",
        expertise_areas=["embedded systems"],
        is_active=True
    )
    db_session.add(e)
    db_session.commit()
    db_session.refresh(e)
    yield e
    db_session.delete(e)
    db_session.commit()

