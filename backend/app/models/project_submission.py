import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
from app.core.database import Base

class ProjectSubmission(Base):
    __tablename__ = "project_submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False, unique=True, index=True)
    uploaded_by_participant_id = Column(UUID(as_uuid=True), ForeignKey("participants.id"), nullable=False)
    
    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    content_type = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
