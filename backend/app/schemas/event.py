# File: backend/app/schemas/event.py
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EventCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    event_type: str = Field(default="generic_competitive_event", max_length=100)
    template_id: uuid.UUID | None = None
    configuration: dict = Field(default_factory=dict)


class EventResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    slug: str
    description: str | None
    event_type: str
    template_id: uuid.UUID | None
    template_version: int | None
    active_capabilities: list
    configuration: dict
    status: str
    is_legacy: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TemplateResponse(BaseModel):
    id: uuid.UUID
    key: str
    name: str
    description: str | None
    event_type_label: str
    version: int
    is_system_template: bool
    default_capabilities: list
    suggested_stages: list
    required_roles: list

    model_config = ConfigDict(from_attributes=True)