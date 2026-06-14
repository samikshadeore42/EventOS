# File: backend/app/models/assignment.py
import uuid
from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import EventScopedMixin  # <-- 1. Import Mixin

# 2. Add EventScopedMixin
class EvaluatorTeamAssignment(EventScopedMixin, Base):
    __tablename__ = "evaluator_team_assignments"

    evaluator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("evaluators.id", ondelete="CASCADE"),
        primary_key=True,
    )
    
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        primary_key=True,
    )