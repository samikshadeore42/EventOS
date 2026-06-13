from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
import uuid

class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None

class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    logo_url: Optional[str] = None

class OrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str]
    logo_url: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class MembershipResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    status: str
    joined_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class MemberDetailResponse(BaseModel):
    membership_id: uuid.UUID
    user_id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    role: str
    status: str
    joined_at: Optional[datetime]

class InvitationCreate(BaseModel):
    email: EmailStr
    role: str = Field(..., pattern="^(owner|admin|member)$")

class InvitationResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    email: EmailStr
    role: str
    status: str
    expires_at: datetime
    
    class Config:
        from_attributes = True

class InvitationPreview(BaseModel):
    organization_name: str
    inviter_name: Optional[str]
    role: str
    email: str
    expires_at: datetime

class OrganizationWithMembership(BaseModel):
    organization: OrganizationResponse
    membership: MembershipResponse

    class Config:
        from_attributes = True
