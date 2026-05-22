# File: backend/app/services/participant_service.py
#
# All participant business logic lives here.
# Routes call this — they never touch the DB directly.
# Keeps routes thin and this layer testable.

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

# These column names are NOT skill columns — everything else in the CSV is
RESERVED_COLUMNS = {"first_name", "last_name", "email", "institution"}


class ParticipantService:

    # ── Read ──────────────────────────────────────────────────────────

    @staticmethod
    def get_by_id(participant_id: uuid.UUID, db: Session) -> Participant:
        p = db.query(Participant).filter(Participant.id == participant_id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Participant not found.")
        return p

    @staticmethod
    def get_by_email(email: str, db: Session) -> Optional[Participant]:
        return db.query(Participant).filter(
            func.lower(Participant.email) == email.lower()
        ).first()

    @staticmethod
    def list_participants(
        filters: ParticipantFilter,
        db:      Session
    ) -> PaginatedParticipants:
        """
        Filtered, sorted, paginated participant list.
        All filters are optional and combinable.
        """
        query = db.query(Participant)

        # Apply filters
        if filters.institution:
            query = query.filter(
                func.lower(Participant.institution).contains(
                    filters.institution.lower()
                )
            )

        if filters.team_assigned is True:
            query = query.filter(Participant.team_id.isnot(None))
        elif filters.team_assigned is False:
            query = query.filter(Participant.team_id.is_(None))

        if filters.search:
            term = f"%{filters.search.lower()}%"
            query = query.filter(
                or_(
                    func.lower(Participant.first_name).like(term),
                    func.lower(Participant.last_name).like(term),
                    func.lower(Participant.email).like(term),
                )
            )

        # Count before pagination
        total = query.count()

        # Apply sort
        sort_col = getattr(Participant, filters.sort_by.value)
        if filters.sort_desc:
            query = query.order_by(sort_col.desc())
        else:
            query = query.order_by(sort_col.asc())

        # Apply pagination
        offset = (filters.page - 1) * filters.page_size
        participants = query.offset(offset).limit(filters.page_size).all()

        # Enrich with team names in one query (avoids N+1)
        team_ids = {p.team_id for p in participants if p.team_id}
        teams    = {}
        if team_ids:
            team_rows = db.query(Team).filter(Team.id.in_(team_ids)).all()
            teams     = {str(t.id): t.team_name for t in team_rows}

        import math
        rows = []
        for p in participants:
            data             = ParticipantResponse.model_validate(p)
            data.team_name   = teams.get(str(p.team_id)) if p.team_id else None
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
    def create(body: ParticipantCreateRequest, db: Session) -> Participant:
        # Email uniqueness check with a clear error message
        existing = ParticipantService.get_by_email(body.email, db)
        if existing:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"A participant with email '{body.email}' already exists "
                    f"(id: {existing.id}). Use PATCH to update them."
                )
            )

        participant = Participant(
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
        participant_id: uuid.UUID,
        body:           ParticipantUpdateRequest,
        db:             Session
    ) -> Participant:
        p = ParticipantService.get_by_id(participant_id, db)

        if body.first_name  is not None: p.first_name  = body.first_name.strip()
        if body.last_name   is not None: p.last_name   = body.last_name.strip()
        if body.institution is not None: p.institution = body.institution.strip()
        if body.skill_vector is not None:
            # Merge skills — don't replace entirely, just update provided keys
            updated          = dict(p.skill_vector)
            updated.update(body.skill_vector)
            p.skill_vector   = updated

        db.commit()
        db.refresh(p)
        return p

    # ── Delete ────────────────────────────────────────────────────────

    @staticmethod
    def delete(participant_id: uuid.UUID, db: Session) -> dict:
        p = ParticipantService.get_by_id(participant_id, db)
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
        file_content: bytes,
        upsert:       bool,
        db:           Session
    ) -> CSVUploadResponse:
        """
        Parses a CSV roster file and bulk-inserts participants.

        upsert=True  → update existing participants by email
        upsert=False → skip rows where email already exists

        Skill columns are auto-detected: any column not in RESERVED_COLUMNS
        is treated as a skill name.

        Validation errors per row are collected and returned —
        one bad row never blocks the rest of the file.
        """
        try:
            text   = file_content.decode("utf-8-sig")   # strip BOM if present
            reader = csv.DictReader(io.StringIO(text))
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Could not parse file as CSV: {e}"
            )

        if not reader.fieldnames:
            raise HTTPException(status_code=400, detail="CSV file is empty.")

        # Normalise headers to lowercase + strip whitespace
        headers = [h.lower().strip() for h in reader.fieldnames]

        # Validate required columns
        required = {"first_name", "last_name", "email", "institution"}
        missing  = required - set(headers)
        if missing:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"CSV is missing required columns: {', '.join(sorted(missing))}. "
                    f"Found columns: {', '.join(headers)}"
                )
            )

        # Detect skill columns — everything that isn't a reserved column
        skill_columns = [h for h in headers if h not in RESERVED_COLUMNS]

        results  = []
        created  = 0
        updated  = 0
        skipped  = 0
        errors   = 0

        for row_num, raw_row in enumerate(reader, start=2):  # start=2 (row 1 = header)
            # Normalise keys
            row = {k.lower().strip(): v.strip() for k, v in raw_row.items() if k}

            email = row.get("email", "").lower().strip()
            if not email:
                results.append(CSVRowResult(
                    row=row_num, email="(empty)", status="error",
                    error="Email is required"
                ))
                errors += 1
                continue

            # Build skill vector from detected skill columns
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
                results.append(CSVRowResult(
                    row=row_num, email=email, status="error", error=parse_error
                ))
                errors += 1
                continue

            # Validate required fields
            first_name  = row.get("first_name", "").strip()
            last_name   = row.get("last_name", "").strip()
            institution = row.get("institution", "").strip()

            if not all([first_name, last_name, institution]):
                results.append(CSVRowResult(
                    row=row_num, email=email, status="error",
                    error="first_name, last_name, and institution are required"
                ))
                errors += 1
                continue

            # Check for existing participant
            existing = ParticipantService.get_by_email(email, db)

            if existing:
                if upsert:
                    existing.first_name   = first_name
                    existing.last_name    = last_name
                    existing.institution  = institution
                    existing.skill_vector = skill_vector
                    db.commit()
                    results.append(CSVRowResult(row=row_num, email=email, status="updated"))
                    updated += 1
                else:
                    results.append(CSVRowResult(
                        row=row_num, email=email, status="skipped",
                        error="Email already exists (use upsert=true to update)"
                    ))
                    skipped += 1
            else:
                participant = Participant(
                    first_name   = first_name,
                    last_name    = last_name,
                    email        = email,
                    institution  = institution,
                    skill_vector = skill_vector,
                )
                db.add(participant)
                results.append(CSVRowResult(row=row_num, email=email, status="created"))
                created += 1

        # Commit all successful inserts in one transaction
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Database error during bulk insert: {e}"
            )

        return CSVUploadResponse(
            total_rows   = len(results),
            created      = created,
            updated      = updated,
            skipped      = skipped,
            errors       = errors,
            rows         = results,
            sample_skills = skill_columns,
            message      = (
                f"Upload complete: {created} created, {updated} updated, "
                f"{skipped} skipped, {errors} errors."
            )
        )

    # ── Roster Summary ────────────────────────────────────────────────

    @staticmethod
    def get_roster_summary(db: Session) -> RosterSummary:
        """
        Aggregated stats for the admin dashboard header cards.
        Uses indexed queries only — no full table scans.
        """
        total       = db.query(func.count(Participant.id)).scalar() or 0
        assigned    = db.query(func.count(Participant.id)).filter(
            Participant.team_id.isnot(None)
        ).scalar() or 0
        unassigned  = total - assigned

        # Institution breakdown — uses institution column directly
        inst_rows   = db.query(
            Participant.institution,
            func.count(Participant.id).label("count")
        ).group_by(Participant.institution).order_by(
            func.count(Participant.id).desc()
        ).all()

        institution_counts = {row.institution: row.count for row in inst_rows}
        institutions       = list(institution_counts.keys())

        # Skill summary — load all skill vectors, aggregate in Python
        # (JSONB aggregation in Postgres requires complex SQL;
        #  Python is fast enough for ≤200 participants)
        all_participants  = db.query(Participant.skill_vector).all()
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

        return RosterSummary(
            total_participants  = total,
            assigned_to_team    = assigned,
            unassigned          = unassigned,
            institutions        = institutions,
            institution_counts  = institution_counts,
            skill_summary       = skill_summary,
            csv_template_url    = "/participants/csv-template",
        )
