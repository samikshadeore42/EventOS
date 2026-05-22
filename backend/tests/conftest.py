# File: backend/tests/conftest.py
#
# Shared pytest fixtures used across all test files.
# conftest.py is auto-loaded by pytest — no import needed.

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


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Create all tables once per test session, drop after."""
    # Import all models so SQLAlchemy registers them
    from app.models import participant, evaluation  # noqa: F401
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    import os
    if os.path.exists("test.db"):
        os.remove("test.db")


@pytest.fixture(scope="session")
def client():
    """Shared TestClient — one instance for the full session."""
    return TestClient(app)


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
