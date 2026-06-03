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

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
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
    expires_in: timedelta = timedelta(days=7)
) -> str:
    now     = datetime.now(timezone.utc)
    payload = {
        "sub":   subject,          
        "role":  role,             
        "stage": stage,            
        "iat":   now,             
        "exp":   now + expires_in,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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

import bcrypt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


SCORE_SECRET_SALT = os.getenv("SCORE_SECRET_SALT", "eventos-zero-trust-salt")
def generate_score_hash(evaluator_id: UUID | str, team_id: UUID | str, scores: dict)-> str:
    sorted_scores_string = json.dumps(scores, sort_keys=True)
    payload = f"{str(evaluator_id)}:{str(team_id)}:{sorted_scores_string}:{SCORE_SECRET_SALT}"
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()