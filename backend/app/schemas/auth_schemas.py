# File: backend/app/schemas/auth_schemas.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TokenPayload(BaseModel):
    sub:   str           
    role:  str          
    stage: str          
    iat:   Optional[datetime] = None
    exp:   Optional[datetime] = None


class GenerateLinkRequest(BaseModel):
    entity_id:  str    
    role:       str    
    stage:      str    
    expires_days: int  = 7


class GenerateLinkResponse(BaseModel):
    entity_id:  str
    role:       str
    token:      str
    portal_url: str   
    expires_in: str   