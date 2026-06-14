from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
import uuid

class UserCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)

class OwnerRegistrationRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    organization_name: str = Field(..., min_length=1, max_length=255)
    organization_slug: str = Field(..., min_length=1, max_length=255)

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"

class RefreshRequest(BaseModel):
    refresh_token: str | None = None

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)

class UserResponse(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    email_verified: bool
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class InvitationRegistrationRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8)