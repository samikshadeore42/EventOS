import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.stage_definition import StageDefinition
from app.models.stage_run import StageRun
from app.models.scheduled_action import ScheduledAction

class StageService:
    def __init__(self, db: Session, event_id: uuid.UUID):
        self.db = db
        self.event_id = event_id

    def list_stage_definitions(self):
        return self.db.query(StageDefinition).filter(
            StageDefinition.event_id == self.event_id
        ).order_by(StageDefinition.position).all()

    def get_stage_definition(self, stage_id: uuid.UUID):
        stage = self.db.query(StageDefinition).filter(
            StageDefinition.event_id == self.event_id,
            StageDefinition.id == stage_id
        ).first()
        if not stage:
            raise HTTPException(status_code=404, detail="Stage definition not found")
        return stage

    def create_stage_definition(self, data: dict):
        stage = StageDefinition(event_id=self.event_id, **data)
        self.db.add(stage)
        self.db.commit()
        self.db.refresh(stage)
        return stage

    def update_stage_definition(self, stage_id: uuid.UUID, data: dict):
        stage = self.get_stage_definition(stage_id)
        for key, value in data.items():
            setattr(stage, key, value)
        self.db.commit()
        self.db.refresh(stage)
        return stage

    def delete_stage_definition(self, stage_id: uuid.UUID):
        stage = self.get_stage_definition(stage_id)
        self.db.delete(stage)
        self.db.commit()

    def list_stage_runs(self):
        return self.db.query(StageRun).filter(
            StageRun.event_id == self.event_id
        ).all()

    def get_stage_run(self, run_id: uuid.UUID):
        run = self.db.query(StageRun).filter(
            StageRun.event_id == self.event_id,
            StageRun.id == run_id
        ).first()
        if not run:
            raise HTTPException(status_code=404, detail="Stage run not found")
        return run

    def generate_stage_runs(self):
        # Create stage runs for all active definitions if they don't exist
        defs = self.list_stage_definitions()
        for stage_def in defs:
            if not stage_def.is_active:
                continue
            existing = self.db.query(StageRun).filter(
                StageRun.event_id == self.event_id,
                StageRun.stage_definition_id == stage_def.id
            ).first()
            if not existing:
                run = StageRun(
                    event_id=self.event_id,
                    stage_definition_id=stage_def.id,
                    status="pending"
                )
                self.db.add(run)
        self.db.commit()

    def advance_stage(self, stage_id: uuid.UUID):
        run = self.db.query(StageRun).filter(
            StageRun.event_id == self.event_id,
            StageRun.stage_definition_id == stage_id
        ).first()
        if not run:
            raise HTTPException(status_code=400, detail="Stage run not found. Generate runs first.")

        # Complete currently active runs
        active_runs = self.db.query(StageRun).filter(
            StageRun.event_id == self.event_id,
            StageRun.status == "active"
        ).all()
        for active in active_runs:
            active.status = "completed"
            active.ended_at = datetime.now(timezone.utc)

        run.status = "active"
        run.started_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(run)
        return run

    def schedule_action(self, stage_id: uuid.UUID, action_type: str, run_at: datetime, payload: dict):
        action = ScheduledAction(
            event_id=self.event_id,
            stage_definition_id=stage_id,
            action_type=action_type,
            run_at=run_at,
            status="pending",
            payload=payload,
            idempotency_key=f"{self.event_id}-{stage_id}-{action_type}-{int(run_at.timestamp())}"
        )
        self.db.add(action)
        self.db.commit()
        self.db.refresh(action)
        return action
