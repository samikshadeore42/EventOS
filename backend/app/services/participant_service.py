# File: backend/app/services/participant_service.py

import csv
import io
import uuid
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from fastapi import HTTPException

from app.models.participant import Participant, Team
from app.schemas.participant_crud_schemas import (
    ParticipantCreateRequest,
    ParticipantUpdateRequest,
    ParticipantFilter,
    ParticipantSortField,
    CSVRowResult,
    CSVUploadResponse,
    ParticipantResponse,
    PaginatedParticipants,
    RosterSummary,
    SkillSummary,
)

RESERVED_COLUMNS = {"first_name", "last_name", "email", "institution"}

class ParticipantService:

    # ── Read ──────────────────────────────────────────────────────────

    @staticmethod
    def get_by_id(event_id: uuid.UUID, participant_id: uuid.UUID, db: Session) -> Participant:
        p = db.query(Participant).filter(
            Participant.id == participant_id,
            Participant.event_id == event_id  # <-- 1. Enforce Event Isolation
        ).first()
        if not p:
            raise HTTPException(status_code=404, detail="Participant not found.")
        return p

    @staticmethod
    def get_by_email(event_id: uuid.UUID, email: str, db: Session) -> Optional[Participant]:
        return db.query(Participant).filter(
            func.lower(Participant.email) == email.lower(),
            Participant.event_id == event_id  # <-- Enforce Event Isolation
        ).first()

    @staticmethod
    def list_participants(
        event_id: uuid.UUID,
        filters:  ParticipantFilter,
        db:       Session
    ) -> PaginatedParticipants:
        
        # Base query now heavily restricted to the current event
        query = db.query(Participant).filter(Participant.event_id == event_id)

        if filters.institution:
            query = query.filter(
                func.lower(Participant.institution).contains(
                    filters.institution.lower()
                )
            )

        if filters.team_assigned is not None:
            query = query.outerjoin(Team, Participant.team_id == Team.id)
            if filters.team_assigned is True:
                query = query.filter(Participant.team_id.isnot(None), Team.approval_status == "published")
            elif filters.team_assigned is False:
                query = query.filter(or_(Participant.team_id.is_(None), Team.approval_status != "published"))

        if filters.search:
            term = f"%{filters.search.lower()}%"
            query = query.filter(
                or_(
                    func.lower(Participant.first_name).like(term),
                    func.lower(Participant.last_name).like(term),
                    func.lower(Participant.email).like(term),
                )
            )

        total = query.count()

        sort_col = getattr(Participant, filters.sort_by.value)
        if filters.sort_desc:
            query = query.order_by(sort_col.desc())
        else:
            query = query.order_by(sort_col.asc())

        offset = (filters.page - 1) * filters.page_size
        participants = query.offset(offset).limit(filters.page_size).all()

        team_ids = {p.team_id for p in participants if p.team_id}
        teams    = {}
        if team_ids:
            # Safely fetch teams, ensuring they also belong to this event
            team_rows = db.query(Team).filter(
                Team.id.in_(team_ids),
                Team.event_id == event_id
            ).all()
            teams = {str(t.id): t for t in team_rows}

        import math
        rows = []
        for p in participants:
            data             = ParticipantResponse.model_validate(p)
            team_obj         = teams.get(str(p.team_id)) if p.team_id else None
            
            if team_obj and team_obj.approval_status == "published":
                data.team_name   = team_obj.team_name
                data.team_status = "published"
            elif team_obj:
                data.team_name   = None
                data.team_status = "pending_approval"
            else:
                data.team_name   = None
                data.team_status = None
                
            rows.append(data)

        return PaginatedParticipants(
            total       = total,
            page        = filters.page,
            page_size   = filters.page_size,
            total_pages = math.ceil(total / filters.page_size) if total else 0,
            participants = rows,
        )

    # ── Create ────────────────────────────────────────────────────────

    @staticmethod
    def create(event_id: uuid.UUID, body: ParticipantCreateRequest, db: Session) -> Participant:
        existing = ParticipantService.get_by_email(event_id, body.email, db)
        if existing:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"A participant with email '{body.email}' already exists in this event "
                    f"(id: {existing.id}). Use PATCH to update them."
                )
            )

        participant = Participant(
            event_id     = event_id, # <-- Bind to event
            first_name   = body.first_name.strip(),
            last_name    = body.last_name.strip(),
            email        = body.email.lower().strip(),
            institution  = body.institution.strip(),
            skill_vector = body.skill_vector,
        )
        db.add(participant)
        db.commit()
        db.refresh(participant)
        return participant

    # ── Update ────────────────────────────────────────────────────────

    @staticmethod
    def update(
        event_id:       uuid.UUID,
        participant_id: uuid.UUID,
        body:           ParticipantUpdateRequest,
        db:             Session
    ) -> Participant:
        p = ParticipantService.get_by_id(event_id, participant_id, db)

        if body.first_name  is not None: p.first_name  = body.first_name.strip()
        if body.last_name   is not None: p.last_name   = body.last_name.strip()
        if body.institution is not None: p.institution = body.institution.strip()
        if body.skill_vector is not None:
            updated          = dict(p.skill_vector)
            updated.update(body.skill_vector)
            p.skill_vector   = updated

        db.commit()
        db.refresh(p)
        return p

    @staticmethod
    def confirm_progression(
        event_id:       uuid.UUID,
        participant_id: uuid.UUID,
        confirmed:      bool,
        db:             Session
    )-> Participant:
        p=ParticipantService.get_by_id(event_id, participant_id, db)
        p.progression_confirmed = confirmed
        db.commit()
        db.refresh(p)
        return p
    
    # ── Delete ────────────────────────────────────────────────────────

    @staticmethod
    def delete(event_id: uuid.UUID, participant_id: uuid.UUID, db: Session) -> dict:
        p = ParticipantService.get_by_id(event_id, participant_id, db)
        db.delete(p)
        db.commit()
        return {
            "deleted":  True,
            "id":       str(participant_id),
            "message":  f"Participant '{p.first_name} {p.last_name}' deleted."
        }

    # ── CSV Upload ────────────────────────────────────────────────────

    @staticmethod
    def process_csv_upload(
        event_id:     uuid.UUID,
        file_content: bytes,
        upsert:       bool,
        db:           Session
    ) -> CSVUploadResponse:
        try:
            text   = file_content.decode("utf-8-sig")  
            reader = csv.DictReader(io.StringIO(text))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse file as CSV: {e}")

        if not reader.fieldnames:
            raise HTTPException(status_code=400, detail="CSV file is empty.")

        headers = [h.lower().strip() for h in reader.fieldnames]
        required = {"first_name", "last_name", "email", "institution"}
        missing  = required - set(headers)
        
        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"CSV is missing required columns: {', '.join(sorted(missing))}."
            )

        skill_columns = [h for h in headers if h not in RESERVED_COLUMNS]

        results  = []
        created  = 0
        updated  = 0
        skipped  = 0
        errors   = 0

        for row_num, raw_row in enumerate(reader, start=2):
            row = {k.lower().strip(): v.strip() for k, v in raw_row.items() if k}

            email = row.get("email", "").lower().strip()
            if not email:
                results.append(CSVRowResult(row=row_num, email="(empty)", status="error", error="Email is required"))
                errors += 1
                continue

            skill_vector = {}
            parse_error  = None
            for skill in skill_columns:
                raw_val = row.get(skill, "").strip()
                if not raw_val:
                    skill_vector[skill] = 0.0
                    continue
                try:
                    val = float(raw_val)
                    if not (0.0 <= val <= 10.0):
                        raise ValueError(f"Score {val} out of range 0.0–10.0")
                    skill_vector[skill] = round(val, 2)
                except ValueError as e:
                    parse_error = f"Skill '{skill}': {e}"
                    break

            if parse_error:
                results.append(CSVRowResult(row=row_num, email=email, status="error", error=parse_error))
                errors += 1
                continue

            first_name  = row.get("first_name", "").strip()
            last_name   = row.get("last_name", "").strip()
            institution = row.get("institution", "").strip()

            if not all([first_name, last_name, institution]):
                results.append(CSVRowResult(row=row_num, email=email, status="error", error="first_name, last_name, and institution are required"))
                errors += 1
                continue

            existing = ParticipantService.get_by_email(event_id, email, db)

            if existing:
                if upsert:
                    existing.first_name   = first_name
                    existing.last_name    = last_name
                    existing.institution  = institution
                    existing.skill_vector = skill_vector
                    results.append(CSVRowResult(row=row_num, email=email, status="updated"))
                    updated += 1
                else:
                    results.append(CSVRowResult(row=row_num, email=email, status="skipped", error="Email already exists (use upsert=true to update)"))
                    skipped += 1
            else:
                participant = Participant(
                    event_id     = event_id, # <-- Bind to event
                    first_name   = first_name,
                    last_name    = last_name,
                    email        = email,
                    institution  = institution,
                    skill_vector = skill_vector,
                )
                db.add(participant)
                results.append(CSVRowResult(row=row_num, email=email, status="created"))
                created += 1

        try:
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Database error during bulk insert: {e}")

        return CSVUploadResponse(
            total_rows   = len(results),
            created      = created,
            updated      = updated,
            skipped      = skipped,
            errors       = errors,
            rows         = results,
            sample_skills = skill_columns,
            message      = f"Upload complete: {created} created, {updated} updated, {skipped} skipped, {errors} errors."
        )

    # ── Roster Summary ────────────────────────────────────────────────

    @staticmethod
    def get_roster_summary(event_id: uuid.UUID, db: Session) -> RosterSummary:
        # Base count now scoped
        total       = db.query(func.count(Participant.id)).filter(Participant.event_id == event_id).scalar() or 0
        
        assigned    = db.query(func.count(Participant.id)).outerjoin(Team, Participant.team_id == Team.id).filter(
            Participant.event_id == event_id,
            Participant.team_id.isnot(None),
            Team.approval_status == "published"
        ).scalar() or 0
        
        unassigned  = total - assigned

        inst_rows   = db.query(
            Participant.institution,
            func.count(Participant.id).label("count")
        ).filter(Participant.event_id == event_id).group_by(Participant.institution).order_by(
            func.count(Participant.id).desc()
        ).all()

        institution_counts = {row.institution: row.count for row in inst_rows}
        institutions       = list(institution_counts.keys())

        all_participants  = db.query(Participant.skill_vector).filter(Participant.event_id == event_id).all()
        skill_aggregates: dict[str, list[float]] = {}

        for (sv,) in all_participants:
            if not sv:
                continue
            for skill, score in sv.items():
                skill_aggregates.setdefault(skill, []).append(float(score))

        skill_summary = [
            SkillSummary(
                skill   = skill,
                average = round(sum(scores) / len(scores), 2),
                min     = round(min(scores), 2),
                max     = round(max(scores), 2),
            )
            for skill, scores in sorted(skill_aggregates.items())
            if scores
        ]

        # Update frontend URL dynamically for the CSV template
        return RosterSummary(
            total_participants  = total,
            assigned_to_team    = assigned,
            unassigned          = unassigned,
            institutions        = institutions,
            institution_counts  = institution_counts,
            skill_summary       = skill_summary,
            csv_template_url    = f"/events/{event_id}/participants/csv-template",
        )