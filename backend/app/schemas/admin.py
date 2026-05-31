from pydantic import BaseModel
from typing import Optional

class AdminSignup(BaseModel):
    username: str
    employee_id: str
    password: str
    confirm_password: str

class AdminLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
