import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from app.core.security import JWT_SECRET_KEY, ALGORITHM
from typing import Optional

class TokenService:
    @staticmethod
    def generate_random_token() -> str:
        return secrets.token_urlsafe(32)

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256(token.encode('utf-8')).hexdigest()

    @staticmethod
    def create_access_token(
        user_id: str,
        session_id: str,
        token_version: int,
        role: str = "admin",
        expires_in: timedelta = timedelta(minutes=15)
    ) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(user_id),
            "sid": str(session_id),
            "ver": token_version,
            "role": role,
            "iat": now,
            "exp": now + expires_in,
            "jti": secrets.token_urlsafe(16),
        }
        return jwt.encode(payload, JWT_SECRET_KEY, algorithm=ALGORITHM)

    @staticmethod
    def decode_access_token(token: str) -> Optional[dict]:
        try:
            return jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        except JWTError:
            return None
