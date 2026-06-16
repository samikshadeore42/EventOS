import csv
import io
import re
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.mentor import Mentor
from app.models.evaluation import Evaluator
from app.schemas.people_import_schemas import ImportSummary, ImportRowResult


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

MAX_CSV_SIZE = 5 * 1024 * 1024  # 5MB

class PeopleCSVService:
    @staticmethod
    def parse_csv_bytes(content: bytes, max_size: int = MAX_CSV_SIZE) -> List[Dict[str, str]]:
        if len(content) > max_size:
            raise HTTPException(status_code=413, detail="File too large. Maximum size is 5MB.")
        try:
            text = content.decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(text))
            return list(reader)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid CSV format: {str(e)}")

    @staticmethod
    def split_list(value: str) -> List[str]:
        if not value:
            return []
        parts = re.split(r'[;|,]', value)
        return [p.strip() for p in parts if p.strip()]

    @staticmethod
    def _export_csv(items: List[Any], fieldnames: List[str]) -> str:
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for item in items:
            writer.writerow(item)
        return output.getvalue()

    @staticmethod
    def export_mentors(event_id: str, db: Session) -> str:
        mentors = db.query(Mentor).filter(Mentor.event_id == event_id).all()
        fieldnames = ["first_name", "last_name", "email", "organization", "expertise_areas"]
        data = []
        for m in mentors:
            data.append({
                "first_name": m.first_name,
                "last_name": m.last_name,
                "email": m.email,
                "organization": m.organization or "",
                "expertise_areas": "; ".join(m.expertise_areas) if m.expertise_areas else ""
            })
        return PeopleCSVService._export_csv(data, fieldnames)

    @staticmethod
    def export_evaluators(event_id: str, db: Session) -> str:
        evaluators = db.query(Evaluator).filter(Evaluator.event_id == event_id).all()
        fieldnames = ["first_name", "last_name", "email", "passed_out_institution", "expertise_areas"]
        data = []
        for e in evaluators:
            data.append({
                "first_name": e.first_name,
                "last_name": e.last_name,
                "email": e.email,
                "passed_out_institution": e.passed_out_institution or "",
                "expertise_areas": "; ".join(e.expertise_areas) if e.expertise_areas else ""
            })
        return PeopleCSVService._export_csv(data, fieldnames)

    @staticmethod
    def import_mentors(event_id: str, db: Session, content: bytes, upsert: bool = False) -> ImportSummary:
        rows = PeopleCSVService.parse_csv_bytes(content)
        return PeopleCSVService._import_people(
            event_id=event_id,
            db=db,
            rows=rows,
            model_class=Mentor,
            required_fields=["first_name", "last_name", "email"],
            optional_fields=["organization"],
            list_fields=["expertise_areas"],
            upsert=upsert
        )

    @staticmethod
    def import_evaluators(event_id: str, db: Session, content: bytes, upsert: bool = False) -> ImportSummary:
        rows = PeopleCSVService.parse_csv_bytes(content)
        return PeopleCSVService._import_people(
            event_id=event_id,
            db=db,
            rows=rows,
            model_class=Evaluator,
            required_fields=["first_name", "last_name", "email"],
            optional_fields=["passed_out_institution"],
            list_fields=["expertise_areas"],
            upsert=upsert
        )

    @staticmethod
    def _import_people(
        event_id: str,
        db: Session,
        rows: List[Dict[str, str]],
        model_class: Any,
        required_fields: List[str],
        optional_fields: List[str],
        list_fields: List[str],
        upsert: bool
    ) -> ImportSummary:
        summary = ImportSummary(
            total_rows=len(rows),
            created=0,
            updated=0,
            skipped=0,
            errors=0,
            results=[]
        )

        seen_emails_in_csv = set()
        
        # Load existing people for this event
        existing_records = db.query(model_class).filter(model_class.event_id == event_id).all()
        existing_by_email = {r.email.lower().strip(): r for r in existing_records}

        for i, row in enumerate(rows, start=1):
            try:
                # Basic validation
                missing = [f for f in required_fields if not row.get(f, "").strip()]
                if missing:
                    summary.errors += 1
                    summary.results.append(ImportRowResult(
                        row_number=i,
                        email=row.get("email", "").strip() or None,
                        status="error",
                        message=f"Missing required fields: {', '.join(missing)}"
                    ))
                    continue

                email = row["email"].strip().lower()

                if not EMAIL_RE.match(email):
                    summary.errors += 1
                    summary.results.append(ImportRowResult(
                        row_number=i,
                        email=email,
                        status="error",
                        message="Invalid email format"
                    ))
                    continue
                
                if email in seen_emails_in_csv:
                    summary.errors += 1
                    summary.results.append(ImportRowResult(
                        row_number=i,
                        email=email,
                        status="error",
                        message="Duplicate email in CSV"
                    ))
                    continue
                seen_emails_in_csv.add(email)

                # Prepare data
                data = {
                    "event_id": event_id,
                    "first_name": row["first_name"].strip(),
                    "last_name": row["last_name"].strip(),
                    "email": email
                }
                for opt in optional_fields:
                    data[opt] = row.get(opt, "").strip() or None
                for lf in list_fields:
                    data[lf] = PeopleCSVService.split_list(row.get(lf, ""))

                existing = existing_by_email.get(email)
                if existing:
                    if not upsert:
                        summary.errors += 1
                        summary.results.append(ImportRowResult(
                            row_number=i,
                            email=email,
                            status="error",
                            message="Duplicate email already in event and upsert=false"
                        ))
                    else:
                        # Update existing
                        for k, v in data.items():
                            setattr(existing, k, v)
                        summary.updated += 1
                        summary.results.append(ImportRowResult(
                            row_number=i,
                            email=email,
                            status="updated",
                            message="Updated existing record",
                            id=existing.id
                        ))
                else:
                    # Create new
                    new_record = model_class(**data)
                    db.add(new_record)
                    # We commit at the end, but we can assign IDs or let DB do it.
                    # Since we are adding objects to the session, we will not get their UUIDs until flush/commit
                    # unless we pre-generate them. Let's pre-generate them to return ID in result.
                    import uuid
                    new_record.id = uuid.uuid4()
                    summary.created += 1
                    summary.results.append(ImportRowResult(
                        row_number=i,
                        email=email,
                        status="created",
                        message="Created new record",
                        id=new_record.id
                    ))

            except Exception as e:
                summary.errors += 1
                summary.results.append(ImportRowResult(
                    row_number=i,
                    email=row.get("email", "").strip() or None,
                    status="error",
                    message=str(e)
                ))

        db.commit()
        return summary
