# backend/app/services/stage_service.py
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.event import Event, EventStatus
from app.models.scheduled_action import ScheduledAction
from app.models.stage_definition import StageDefinition
from app.models.stage_run import StageRun
from app.models.stage_transition import StageTransition
from app.schemas.stage_schemas import ScheduleValidationReport, ScheduleViolation


# Friendly messages for DB constraint violations (PG and SQLite phrase these
# differently, so we match on either the constraint name or the column hint).
def _translate_integrity_error(exc: IntegrityError) -> str:
    msg = str(getattr(exc, "orig", exc)).lower()
    if "uq_stage_def_event_position" in msg or ("position" in msg and "unique" in msg):
        return "Another stage already occupies that position for this event."
    if "uq_stage_def_event_key" in msg or (".key" in msg and "unique" in msg):
        return "A stage with that key already exists for this event."
    if "ck_stage_def_time_order" in msg:
        return "Stage end_at must be after start_at."
    if "ck_stage_def_position_positive" in msg:
        return "Stage position must be greater than 0."
    if "ck_stage_def_transition_policy" in msg:
        return "transition_policy must be 'manual' or 'automatic'."
    if "unique" in msg:
        return "A uniqueness constraint was violated for this stage."
    return "The stage could not be saved because it violates a database constraint."


def _aware(dt: datetime) -> datetime:
    """Normalise to tz-aware UTC. SQLite returns naive datetimes even for
    DateTime(timezone=True); this keeps cross-stage comparisons safe."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


class StageService:
    def __init__(self, db: Session, event_id: uuid.UUID):
        self.db = db
        self.event_id = event_id

    # ── internal helpers ─────────────────────────────────────────────────────

    def _commit_or_422(self):
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(status_code=422, detail=_translate_integrity_error(exc))

    def _get_event(self) -> Event:
        event = self.db.query(Event).filter(Event.id == self.event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        return event

    def _record_transition(
        self,
        transition_type: str,
        *,
        from_status: Optional[str] = None,
        to_status: Optional[str] = None,
        stage_definition_id: Optional[uuid.UUID] = None,
        stage_run_id: Optional[uuid.UUID] = None,
        actor_user_id: Optional[uuid.UUID] = None,
        note: Optional[str] = None,
        context: Optional[dict] = None,
    ) -> None:
        """Append a StageTransition. Does NOT commit — the caller owns the tx."""
        self.db.add(StageTransition(
            event_id=self.event_id,
            stage_definition_id=stage_definition_id,
            stage_run_id=stage_run_id,
            transition_type=transition_type,
            from_status=from_status,
            to_status=to_status,
            actor_user_id=actor_user_id,
            note=note,
            context=context or {},
        ))

    # ── stage definition CRUD ────────────────────────────────────────────────

    def list_stage_definitions(self, active_only: bool = False):
        q = self.db.query(StageDefinition).filter(StageDefinition.event_id == self.event_id)
        if active_only:
            q = q.filter(StageDefinition.is_active.is_(True))
        return q.order_by(StageDefinition.position).all()

    def get_stage_definition(self, stage_id: uuid.UUID) -> StageDefinition:
        stage = self.db.query(StageDefinition).filter(
            StageDefinition.event_id == self.event_id,
            StageDefinition.id == stage_id,
        ).first()
        if not stage:
            raise HTTPException(status_code=404, detail="Stage definition not found")
        return stage

    def create_stage_definition(self, data: dict) -> StageDefinition:
        stage = StageDefinition(event_id=self.event_id, **data)
        self.db.add(stage)
        self._commit_or_422()       # surfaces dup key/position as 422, not 500
        self.db.refresh(stage)
        self._record_transition(
            "schedule_change",
            stage_definition_id=stage.id,
            note="stage created",
            context={"key": stage.key, "position": stage.position},
        )
        self.db.commit()
        return stage

    def update_stage_definition(
        self,
        stage_id: uuid.UUID,
        data: dict,
        actor_user_id: Optional[uuid.UUID] = None,
    ) -> StageDefinition:
        stage = self.get_stage_definition(stage_id)
        before = {"start_at": stage.start_at, "end_at": stage.end_at, "position": stage.position}

        for key, value in data.items():
            setattr(stage, key, value)

        # If only one bound was supplied, re-check order against the stored value.
        if _aware(stage.end_at) <= _aware(stage.start_at):
            self.db.rollback()
            raise HTTPException(status_code=422, detail="end_at must be strictly after start_at.")

        self._commit_or_422()
        self.db.refresh(stage)

        times_changed = (
            data.get("start_at") is not None or data.get("end_at") is not None
        )
        if times_changed:
            # Schedule moved → invalidate any future actions tied to this stage,
            # and re-queue them if the event is already live.
            self._cancel_pending_actions(stage.id)
            event = self._get_event()
            if event.status in (EventStatus.PUBLISHED, EventStatus.ACTIVE):
                self._enqueue_actions_for_stage(stage, commit=False)

        self._record_transition(
            "schedule_change",
            stage_definition_id=stage.id,
            actor_user_id=actor_user_id,
            note="stage updated",
            context={
                "changed_fields": list(data.keys()),
                "old_position": before["position"],
                "new_position": stage.position,
            },
        )
        self.db.commit()
        return stage

    def delete_stage_definition(self, stage_id: uuid.UUID, actor_user_id: Optional[uuid.UUID] = None):
        stage = self.get_stage_definition(stage_id)
        self._cancel_pending_actions(stage.id)
        key = stage.key
        self.db.delete(stage)
        # FK is ON DELETE CASCADE, so runs/actions for this stage go too.
        self.db.commit()
        # Event-level transition (stage row is gone, so no stage_definition_id).
        self._record_transition(
            "schedule_change",
            actor_user_id=actor_user_id,
            note=f"stage '{key}' deleted",
            context={"deleted_key": key},
        )
        self.db.commit()

    # ── reorder (collision-safe two-phase) ───────────────────────────────────

    def reorder_stages(
        self,
        ordered_ids: list[uuid.UUID],
        actor_user_id: Optional[uuid.UUID] = None,
    ):
        defs = self.list_stage_definitions()
        by_id = {d.id: d for d in defs}

        if len(set(ordered_ids)) != len(ordered_ids):
            raise HTTPException(status_code=422, detail="ordered_ids contains duplicates.")
        if set(ordered_ids) != set(by_id.keys()):
            raise HTTPException(
                status_code=422,
                detail="ordered_ids must be an exact permutation of this event's stage IDs.",
            )

        # uq_stage_def_event_position forbids transient collisions, so park every
        # row in a disjoint high range first, then assign the final 1..N.
        base = max((d.position for d in defs), default=0) + 1
        for i, sid in enumerate(ordered_ids):
            by_id[sid].position = base + i
        self.db.flush()
        for i, sid in enumerate(ordered_ids):
            by_id[sid].position = i + 1
        self._commit_or_422()

        self._record_transition(
            "reorder",
            actor_user_id=actor_user_id,
            note="stages reordered",
            context={"order": [str(s) for s in ordered_ids]},
        )
        self.db.commit()
        return self.list_stage_definitions()

    # ── the validation core / Hard Gate input ────────────────────────────────

    def validate_schedule(self) -> ScheduleValidationReport:
        """Aggregate every cross-stage rule into a structured report. Pure read —
        never mutates. Used by the preflight endpoint and the publish gate."""
        defs = self.list_stage_definitions(active_only=True)
        violations: list[ScheduleViolation] = []

        if not defs:
            violations.append(ScheduleViolation(
                code="no_stages",
                message="The event has no active stages. Define at least one stage before publishing.",
            ))

        seen_positions: dict[int, uuid.UUID] = {}
        for d in defs:
            # timezone (re-checked here in case data arrived outside the schema layer)
            try:
                ZoneInfo(d.timezone)
            except (ZoneInfoNotFoundError, ValueError, KeyError):
                violations.append(ScheduleViolation(
                    code="invalid_timezone",
                    message=f"Stage '{d.key}' has an invalid IANA timezone '{d.timezone}'.",
                    stage_id=d.id, field="timezone",
                ))
            # time order
            if _aware(d.end_at) <= _aware(d.start_at):
                violations.append(ScheduleViolation(
                    code="bad_time_order",
                    message=f"Stage '{d.key}' ends on or before it starts.",
                    stage_id=d.id, field="end_at",
                ))
            # duplicate position (DB-enforced, but surface it cleanly in the report)
            if d.position in seen_positions:
                violations.append(ScheduleViolation(
                    code="duplicate_position",
                    message=f"Position {d.position} is used by more than one stage.",
                    stage_id=d.id, field="position",
                ))
            seen_positions[d.position] = d.id

        # overlap + chronological consistency: in position order, each stage must
        # end on or before the next one starts (exact boundary touch is allowed).
        for cur, nxt in zip(defs, defs[1:]):
            if _aware(cur.end_at) > _aware(nxt.start_at):
                violations.append(ScheduleViolation(
                    code="stage_overlap",
                    message=(
                        f"Stage '{cur.key}' (pos {cur.position}) overlaps the next "
                        f"stage '{nxt.key}' (pos {nxt.position})."
                    ),
                    stage_id=cur.id, field="end_at",
                ))

        return ScheduleValidationReport(
            is_valid=len(violations) == 0,
            stage_count=len(defs),
            violations=violations,
        )

    # ── stage runs ───────────────────────────────────────────────────────────

    def list_stage_runs(self):
        return self.db.query(StageRun).filter(StageRun.event_id == self.event_id).all()

    def get_stage_run(self, run_id: uuid.UUID) -> StageRun:
        run = self.db.query(StageRun).filter(
            StageRun.event_id == self.event_id, StageRun.id == run_id,
        ).first()
        if not run:
            raise HTTPException(status_code=404, detail="Stage run not found")
        return run

    def generate_stage_runs(self, commit: bool = True) -> int:
        """Materialise a pending StageRun for every active definition that
        doesn't already have one. Idempotent. Returns the number created."""
        created = 0
        for stage_def in self.list_stage_definitions(active_only=True):
            existing = self.db.query(StageRun).filter(
                StageRun.event_id == self.event_id,
                StageRun.stage_definition_id == stage_def.id,
            ).first()
            if not existing:
                self.db.add(StageRun(
                    event_id=self.event_id,
                    stage_definition_id=stage_def.id,
                    status="pending",
                ))
                created += 1
        if commit:
            self.db.commit()
        return created

    def advance_stage(
        self,
        stage_id: uuid.UUID,
        actor_user_id: Optional[uuid.UUID] = None,
        force: bool = False,
    ) -> StageRun:
        """Activate the run for `stage_id`, completing any currently-active run.
        Enforces position order unless force=True (manual override)."""
        target = self.db.query(StageRun).filter(
            StageRun.event_id == self.event_id,
            StageRun.stage_definition_id == stage_id,
        ).first()
        if not target:
            raise HTTPException(status_code=400, detail="Stage run not found. Generate runs first.")

        target_def = self.get_stage_definition(stage_id)

        # Order guard: every earlier-position stage must already be done/skipped.
        if not force:
            earlier_ids = {
                d.id for d in self.list_stage_definitions(active_only=True)
                if d.position < target_def.position
            }
            if earlier_ids:
                unfinished = self.db.query(StageRun).filter(
                    StageRun.event_id == self.event_id,
                    StageRun.stage_definition_id.in_(earlier_ids),
                    StageRun.status.notin_(["completed", "skipped"]),
                ).count()
                if unfinished:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Cannot advance to '{target_def.key}' — {unfinished} earlier "
                            "stage(s) are not completed. Use force to override."
                        ),
                    )

        now = datetime.now(timezone.utc)
        for active in self.db.query(StageRun).filter(
            StageRun.event_id == self.event_id, StageRun.status == "active",
        ).all():
            active.status = "completed"
            active.ended_at = now
            self._record_transition(
                "advance", from_status="active", to_status="completed",
                stage_definition_id=active.stage_definition_id, stage_run_id=active.id,
                actor_user_id=actor_user_id, note="auto-completed on advance",
            )

        from_status = target.status
        target.status = "active"
        target.started_at = now
        self._record_transition(
            "advance", from_status=from_status, to_status="active",
            stage_definition_id=stage_id, stage_run_id=target.id,
            actor_user_id=actor_user_id,
            note="manual override" if force else "advanced",
        )
        self.db.commit()
        self.db.refresh(target)
        return target

    def complete_stage_run(self, stage_id: uuid.UUID) -> Optional[StageRun]:
        """Mark a stage's run completed (used by the stage_end scheduled action)."""
        run = self.db.query(StageRun).filter(
            StageRun.event_id == self.event_id,
            StageRun.stage_definition_id == stage_id,
        ).first()
        if not run or run.status == "completed":
            return run
        run.status = "completed"
        run.ended_at = datetime.now(timezone.utc)
        self._record_transition(
            "advance", from_status="active", to_status="completed",
            stage_definition_id=stage_id, stage_run_id=run.id, note="stage_end reached",
        )
        self.db.commit()
        return run

    # ── Phase 6: automatic engine — approval holds & notifications ───────────

    def _safe_notify(self, *, role: Optional[str] = None, user_id: Optional[uuid.UUID] = None,
                     title: str = "", message: str = "", notification_type: str = "stage") -> None:
        """Best-effort in-app notification. NEVER raises — a notification failure
        must not roll back a committed stage transition (Phase-6 exit condition:
        'failed delivery does not reverse a completed transition'). Phase 7 swaps
        the body of this method to enqueue a transactional-outbox row instead."""
        try:
            from app.services.notification_service import NotificationService
            svc = NotificationService(self.db, self.event_id)
            if user_id is not None:
                svc.notify_user(user_id, title, message, notification_type)
            else:
                svc.notify_role(role or "owner", title, message, notification_type)
        except Exception:  # noqa: BLE001 — notifications are non-critical
            self.db.rollback()  # drop only the failed notification, keep prior commit

    def hold_stage_for_approval(self, stage_id: uuid.UUID) -> StageRun:
        """Park a stage that has reached its start time but whose transition_policy
        is 'manual' — it waits for a committee member to approve before going
        active. Idempotent: a stage already held/active/completed is left as-is."""
        run = self.db.query(StageRun).filter(
            StageRun.event_id == self.event_id,
            StageRun.stage_definition_id == stage_id,
        ).first()
        if not run:
            raise HTTPException(status_code=400, detail="Stage run not found. Generate runs first.")
        if run.status != "pending":
            return run  # already awaiting_approval / active / completed

        stage_def = self.get_stage_definition(stage_id)
        run.status = "awaiting_approval"
        self._record_transition(
            "advance", from_status="pending", to_status="awaiting_approval",
            stage_definition_id=stage_id, stage_run_id=run.id,
            note="reached start time; awaiting committee approval (manual policy)",
        )
        self.db.commit()
        self._safe_notify(
            role="owner",
            title="Stage awaiting approval",
            message=f"Stage '{stage_def.name}' has reached its start time and needs approval to begin.",
            notification_type="stage_awaiting_approval",
        )
        return run

    def approve_stage(self, stage_id: uuid.UUID, actor_user_id: Optional[uuid.UUID] = None) -> StageRun:
        """Committee releases a held stage. Only valid from 'awaiting_approval'."""
        run = self.db.query(StageRun).filter(
            StageRun.event_id == self.event_id,
            StageRun.stage_definition_id == stage_id,
        ).first()
        if not run:
            raise HTTPException(status_code=404, detail="Stage run not found")
        if run.status != "awaiting_approval":
            raise HTTPException(
                status_code=409,
                detail=f"Stage is '{run.status}', not awaiting approval.",
            )
        # force=True: the engine already sequenced this stage; approval is the gate.
        activated = self.advance_stage(stage_id, actor_user_id=actor_user_id, force=True)
        stage_def = self.get_stage_definition(stage_id)
        self._safe_notify(
            role="participant",
            title="Stage started",
            message=f"Stage '{stage_def.name}' is now active.",
            notification_type="stage_started",
        )
        return activated

    # ── scheduled actions ────────────────────────────────────────────────────

    def _cancel_pending_actions(self, stage_definition_id: uuid.UUID) -> int:
        return self.db.query(ScheduledAction).filter(
            ScheduledAction.event_id == self.event_id,
            ScheduledAction.stage_definition_id == stage_definition_id,
            ScheduledAction.status == "pending",
        ).update({ScheduledAction.status: "cancelled"}, synchronize_session=False)

    def _existing_action_keys(self) -> set[str]:
        rows = self.db.query(ScheduledAction.idempotency_key).filter(
            ScheduledAction.event_id == self.event_id,
        ).all()
        return {r[0] for r in rows}

    def _enqueue_actions_for_stage(self, stage_def: StageDefinition, commit: bool = True) -> int:
        """Queue stage_start / stage_end / stage_warning actions for one stage.
        Idempotent: skips any action whose idempotency_key already exists."""
        existing = self._existing_action_keys()
        start_at = _aware(stage_def.start_at)
        end_at = _aware(stage_def.end_at)

        # A grace period (late-submission window) pushes the *effective* end —
        # the stage_end action — out by N minutes. reminder_policy may carry
        # {"grace_minutes": 30}. The displayed deadline (end_at) is unchanged.
        try:
            grace = int((stage_def.reminder_policy or {}).get("grace_minutes", 0) or 0)
        except (TypeError, ValueError):
            grace = 0
        effective_end = end_at + timedelta(minutes=grace) if grace > 0 else end_at

        planned: list[tuple[str, datetime, dict]] = [
            ("stage_start", start_at, {}),
            ("stage_end", effective_end, {"grace_minutes": grace} if grace else {}),
        ]
        # reminder_policy = {"warn_before_minutes": [60, 360, 1440]}
        for minutes in (stage_def.reminder_policy or {}).get("warn_before_minutes", []):
            try:
                warn_at = end_at - timedelta(minutes=int(minutes))
            except (TypeError, ValueError):
                continue
            if warn_at > start_at:
                planned.append(("stage_warning", warn_at, {"warn_before_minutes": int(minutes)}))

        created = 0
        for action_type, run_at, extra in planned:
            suffix = f"-{extra['warn_before_minutes']}" if "warn_before_minutes" in extra else ""
            key = f"{self.event_id}-{stage_def.id}-{action_type}{suffix}-{int(run_at.timestamp())}"
            if key in existing:
                continue
            self.db.add(ScheduledAction(
                event_id=self.event_id,
                stage_definition_id=stage_def.id,
                action_type=action_type,
                run_at=run_at,
                status="pending",
                payload={"stage_key": stage_def.key, **extra},
                idempotency_key=key,
            ))
            existing.add(key)
            created += 1
        if commit:
            self.db.commit()
        return created

    def schedule_action(self, stage_id: uuid.UUID, action_type: str, run_at: datetime, payload: dict):
        action = ScheduledAction(
            event_id=self.event_id,
            stage_definition_id=stage_id,
            action_type=action_type,
            run_at=run_at,
            status="pending",
            payload=payload,
            idempotency_key=f"{self.event_id}-{stage_id}-{action_type}-{int(run_at.timestamp())}",
        )
        self.db.add(action)
        self._commit_or_422()
        self.db.refresh(action)
        return action

    # ── the Hard Gate: publish ───────────────────────────────────────────────

    def publish_event(self, actor_user_id: Optional[uuid.UUID] = None) -> dict:
        """Validate the schedule and, only if clean, atomically:
          materialise runs -> set status=published -> queue actions -> audit.
        Raises 409 if the event isn't a draft, 422 (with violations) if invalid.
        Nothing is mutated unless validation passes."""
        event = self._get_event()
        if event.status != EventStatus.DRAFT:
            raise HTTPException(
                status_code=409,
                detail=f"Event cannot be published from status '{event.status}'. Expected 'draft'.",
            )

        report = self.validate_schedule()
        if not report.is_valid:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Cannot publish: the stage schedule is invalid.",
                    "violations": [v.model_dump(mode="json") for v in report.violations],
                },
            )

        # ── single transaction from here ──
        runs_created = self.generate_stage_runs(commit=False)
        actions_scheduled = 0
        for stage_def in self.list_stage_definitions(active_only=True):
            actions_scheduled += self._enqueue_actions_for_stage(stage_def, commit=False)

        event.status = EventStatus.PUBLISHED
        self._record_transition(
            "publish", from_status=EventStatus.DRAFT, to_status=EventStatus.PUBLISHED,
            actor_user_id=actor_user_id, note="event published",
            context={"runs_created": runs_created, "actions_scheduled": actions_scheduled},
        )
        self._commit_or_422()

        return {
            "event_id": event.id,
            "status": event.status,
            "runs_created": runs_created,
            "actions_scheduled": actions_scheduled,
            "message": f"Event published with {runs_created} stage run(s) and {actions_scheduled} scheduled action(s).",
        }