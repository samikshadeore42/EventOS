import pytest
from datetime import datetime, timedelta, timezone
from app.models.user import User
from app.models.auth_tokens import EmailVerificationToken, PasswordResetToken
from app.core.database import Base, engine, SessionLocal
import uuid

@pytest.fixture(scope="module")
def db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)

def test_verification_token_can_load_its_user(db):
    user = User(
        first_name="Test",
        last_name="User",
        email=f"test_{uuid.uuid4()}@example.com",
        password_hash="hash"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = EmailVerificationToken(
        user_id=user.id,
        token_hash="hash",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
    )
    db.add(token)
    db.commit()
    db.refresh(token)

    assert token.user is not None
    assert token.user.id == user.id
    assert len(user.email_verification_tokens) == 1

def test_reset_token_can_load_its_user(db):
    user = User(
        first_name="Test",
        last_name="User",
        email=f"test_{uuid.uuid4()}@example.com",
        password_hash="hash"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = PasswordResetToken(
        user_id=user.id,
        token_hash="hash",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
    )
    db.add(token)
    db.commit()
    db.refresh(token)

    assert token.user is not None
    assert token.user.id == user.id
    assert len(user.password_reset_tokens) == 1

def test_expired_tokens_are_rejected(db):
    user = User(
        first_name="Test",
        last_name="User",
        email=f"test_{uuid.uuid4()}@example.com",
        password_hash="hash"
    )
    db.add(user)
    db.commit()

    now = datetime.now(timezone.utc)
    token = EmailVerificationToken(
        user_id=user.id,
        token_hash="expired_hash",
        expires_at=now - timedelta(hours=1)
    )
    db.add(token)
    db.commit()
    db.refresh(token)

    assert token.is_valid is False

def test_used_tokens_are_rejected(db):
    user = User(
        first_name="Test",
        last_name="User",
        email=f"test_{uuid.uuid4()}@example.com",
        password_hash="hash"
    )
    db.add(user)
    db.commit()

    now = datetime.now(timezone.utc)
    token = EmailVerificationToken(
        user_id=user.id,
        token_hash="used_hash",
        expires_at=now + timedelta(hours=1),
        used_at=now
    )
    db.add(token)
    db.commit()
    db.refresh(token)

    assert token.is_valid is False

def test_deleted_users_cascade(db):
    user = User(
        first_name="Test",
        last_name="User",
        email=f"test_delete_{uuid.uuid4()}@example.com",
        password_hash="hash"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = EmailVerificationToken(
        user_id=user.id,
        token_hash="hash",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
    )
    db.add(token)
    db.commit()

    # Delete the user and ensure the token is also deleted due to cascade delete-orphan
    db.delete(user)
    db.commit()

    token_check = db.query(EmailVerificationToken).filter(EmailVerificationToken.id == token.id).first()
    assert token_check is None
