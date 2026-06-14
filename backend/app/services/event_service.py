# backend/app/services/event_service.py
from sqlalchemy.orm import Session
from app.models.event import Event
from app.models.template import Template
from fastapi import HTTPException

class EventService:
    @staticmethod
    def create_event_from_template(db: Session, template_id: str, event_data: dict, org_id: str):
        # 1. Fetch the blueprint
        template = db.query(Template).filter(Template.id == template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")

        # 2. Instantiate the Event instance
        new_event = Event(
            name=event_data["name"],
            slug=event_data["slug"],
            organization_id=org_id,
            template_id=template.id,
            template_version=template.version,
            active_capabilities=template.default_capabilities, # Inherit blueprint
            configuration=event_data.get("configuration", {})
        )

        db.add(new_event)
        db.commit()
        db.refresh(new_event)
        return new_event