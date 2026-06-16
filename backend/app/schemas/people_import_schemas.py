import uuid
from typing import Literal, Optional
from pydantic import BaseModel

class ImportRowResult(BaseModel):
    row_number: int
    email: Optional[str] = None
    status: Literal["created", "updated", "skipped", "error"]
    message: str
    id: Optional[uuid.UUID] = None

class ImportSummary(BaseModel):
    total_rows: int
    created: int
    updated: int
    skipped: int
    errors: int
    results: list[ImportRowResult]

class MentorImportRow(BaseModel):
    first_name: str
    last_name: str
    email: str
    organization: Optional[str] = None
    expertise_areas: list[str]

class EvaluatorImportRow(BaseModel):
    first_name: str
    last_name: str
    email: str
    passed_out_institution: Optional[str] = None
    expertise_areas: list[str]
