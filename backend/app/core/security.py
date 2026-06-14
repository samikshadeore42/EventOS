# File: backend/app/core/security.py

import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from fastapi import HTTPException, status
from dotenv import load_dotenv
import hashlib
import json
from uuid import UUID

load_dotenv()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not JWT_SECRET_KEY and os.getenv("TESTING") != "true":
    raise ValueError("FATAL: JWT_SECRET_KEY environment variable must be set securely.")

if not JWT_SECRET_KEY:
    JWT_SECRET_KEY = "test-secret"

ALGORITHM  = os.getenv("ALGORITHM", "HS256")


class TokenRole:
    PARTICIPANT = "participant"
    EVALUATOR   = "evaluator"
    MENTOR      = "mentor"
    ADMIN       = "admin"


def create_access_token(
    subject:    str,              
    role:       str,              
    stage:      str,
    event_id:   str, # <-- 1. Require event_id
    expires_in: timedelta = timedelta(days=7)
) -> str:
    now     = datetime.now(timezone.utc)
    payload = {
        "sub":      subject,          
        "role":     role,             
        "stage":    stage, 
        "event_id": event_id, # <-- 2. Cryptographically bind it to the payload           
        "iat":      now,             
        "exp":      now + expires_in,
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def verify_token_role(payload: dict, required_role: str) -> None:
    if payload.get("role") != required_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Access denied. This link is for '{required_role}' users. "
                f"Your token has role '{payload.get('role')}'."
            )
        )


def get_token_subject(payload: dict) -> str:
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim."
        )
    return sub

def parse_uuid_subject(value, label: str = "token subject") -> UUID:
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(
            status_code=401,
            detail=f"Invalid {label}."
        )

import bcrypt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except (ValueError, TypeError, AttributeError):
        return False

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


SCORE_SECRET_SALT = os.getenv("SCORE_SECRET_SALT", "eventos-zero-trust-salt")
def generate_score_hash(evaluator_id: UUID | str, team_id: UUID | str, scores: dict)-> str:
    sorted_scores_string = json.dumps(scores, sort_keys=True)
    payload = f"{str(evaluator_id)}:{str(team_id)}:{sorted_scores_string}:{SCORE_SECRET_SALT}"
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()