# File: backend/app/models/template.py
import uuid
from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Template(Base):
    __tablename__ = "templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    version = Column(Integer, default=1, nullable=False)
    
    is_system_template = Column(Boolean, default=False, nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)

    default_capabilities = Column(JSONB, default=list, nullable=False)
    
    suggested_stages = Column(JSONB, default=list, nullable=False)
    
    required_roles = Column(JSONB, default=list, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization", backref="custom_templates")