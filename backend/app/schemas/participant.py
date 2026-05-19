# File: backend/app/schemas/participant.py
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Dict, Optional, List
from uuid import UUID


class ParticipantBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name:  str = Field(..., min_length=1, max_length=50)
    email:       EmailStr
    institution: str = Field(..., min_length=2, max_length=100)

    # Skill vector: e.g. {"python": 8.5, "ml": 7.0, "frontend": 4.0}
    skill_vector: Dict[str, float] = Field(
        ...,
        description="Skills mapped to normalized scores between 0.0 and 10.0"
    )

    @field_validator("skill_vector")
    @classmethod
    def validate_skill_scores(cls, v: Dict[str, float]) -> Dict[str, float]:
        for skill, score in v.items():
            if not (0.0 <= score <= 10.0):
                raise ValueError(
                    f"Skill '{skill}' score {score} must be between 0.0 and 10.0"
                )
        return v


class ParticipantCreate(ParticipantBase):
    """Used when registering a new participant via CSV or form."""
    pass


class ParticipantUpdate(BaseModel):
    """Partial update — all fields optional."""
    first_name:   Optional[str]             = None
    last_name:    Optional[str]             = None
    institution:  Optional[str]             = None
    skill_vector: Optional[Dict[str, float]] = None


class ParticipantResponse(ParticipantBase):
    """Returned to the frontend — includes DB-assigned fields."""
    id:      UUID
    team_id: Optional[UUID] = None

    model_config = {"from_attributes": True}


# ── Bulk CSV upload schema ───────────────────────────────────────────
class ParticipantBulkUpload(BaseModel):
    """Wraps a list of participants for CSV import endpoint."""
    participants: List[ParticipantCreate] = Field(
        ..., min_length=1, description="At least one participant required"
    )


# ── Mock roster for testing (your Day 1 deliverable) ────────────────
MOCK_ROSTER: List[dict] = [
    {
        "first_name": "Aisha",
        "last_name": "Khan",
        "email": "aisha.khan@iitbhu.ac.in",
        "institution": "IIT BHU",
        "skill_vector": {"python": 9.0, "ml": 8.5, "frontend": 3.0, "embedded": 2.0}
    },
    {
        "first_name": "Priya",
        "last_name": "Sharma",
        "email": "priya.sharma@bits.ac.in",
        "institution": "BITS Pilani",
        "skill_vector": {"python": 7.0, "ml": 6.0, "frontend": 8.5, "embedded": 3.0}
    },
    {
        "first_name": "Sneha",
        "last_name": "Reddy",
        "email": "sneha.reddy@vit.ac.in",
        "institution": "VIT",
        "skill_vector": {"python": 5.0, "ml": 4.0, "frontend": 6.0, "embedded": 9.0}
    },
    {
        "first_name": "Divya",
        "last_name": "Nair",
        "email": "divya.nair@nit.ac.in",
        "institution": "NIT Trichy",
        "skill_vector": {"python": 8.0, "ml": 9.0, "frontend": 4.0, "embedded": 5.0}
    },
]