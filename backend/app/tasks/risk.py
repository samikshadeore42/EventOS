import logging
from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.event import Event, EventStatus
from app.services.risk_intelligence_service import RiskIntelligenceService
from celery import shared_task

logger = logging.getLogger(__name__)

@celery_app.task(name="app.tasks.risk.process_risk_sweeps")
def process_risk_sweeps():
    db = SessionLocal()
    processed = 0
    failed = 0
    total_snapshots = 0

    try:
        # Find active events with risk_monitoring capability
        events = db.query(Event).filter(Event.status == EventStatus.ACTIVE).all()
        risk_events = [e for e in events if "risk_monitoring" in (e.active_capabilities or [])]

        for event in risk_events:
            try:
                service = RiskIntelligenceService(db, event.id)
                result = service.run_sweep()
                processed += 1
                total_snapshots += result.created_snapshots
            except Exception as e:
                failed += 1
                logger.error(f"Failed to process risk sweep for event {event.id}: {e}")
                # We do not fail the full task, let it continue
    finally:
        db.close()

    return {
        "processed_events": processed,
        "failed_events": failed,
        "created_snapshots": total_snapshots
    }
