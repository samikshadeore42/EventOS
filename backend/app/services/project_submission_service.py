# File: backend/app/services/project_submission_service.py
import os
import shutil
import uuid
import zipfile
import io
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session

from app.models.participant import Participant
from app.models.evaluation import Evaluator
from app.models.project_submission import ProjectSubmission

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "project_submissions"))
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

class ProjectSubmissionService:
    @staticmethod
    def validate_zip_upload(file: UploadFile):
        if not (file.filename or "").lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="Only .zip project files are allowed.")
        
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)
        
        if size == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        
        if size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Project ZIP must be under 50MB.")

        if not zipfile.is_zipfile(file.file):
            file.file.seek(0)
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid ZIP archive.")
        file.file.seek(0)
            
        return size

    @staticmethod
    def delete_submission_file_safely(path: str):
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass

    @staticmethod
    def save_team_submission(event_id: uuid.UUID, db: Session, participant: Participant, upload_file: UploadFile):
        if not participant.team_id:
            raise HTTPException(status_code=422, detail="You must be assigned to a team before submitting a project.")

        file_size = ProjectSubmissionService.validate_zip_upload(upload_file)

        # 1. Scope upload directory by event to prevent cross-event file collisions
        event_upload_dir = os.path.join(UPLOAD_DIR, str(event_id))
        os.makedirs(event_upload_dir, exist_ok=True)
        
        ext = ".zip"
        unique_id = f"{participant.team_id}_{uuid.uuid4().hex}"
        stored_filename = f"{unique_id}{ext}"
        file_path = os.path.join(event_upload_dir, stored_filename)

        with open(file_path, "wb") as f:
            shutil.copyfileobj(upload_file.file, f)
            
        # 2. Scope the database query to the event
        existing_sub = db.query(ProjectSubmission).filter(
            ProjectSubmission.team_id == participant.team_id,
            ProjectSubmission.event_id == event_id 
        ).first()
        
        if existing_sub:
            ProjectSubmissionService.delete_submission_file_safely(existing_sub.file_path)
            existing_sub.uploaded_by_participant_id = participant.id
            existing_sub.original_filename = upload_file.filename
            existing_sub.stored_filename = stored_filename
            existing_sub.file_path = file_path
            existing_sub.file_size_bytes = file_size
            existing_sub.content_type = upload_file.content_type
            db.commit()
            db.refresh(existing_sub)
            return existing_sub
        else:
            new_sub = ProjectSubmission(
                event_id=event_id, # 3. Bind the new row to the event
                team_id=participant.team_id,
                uploaded_by_participant_id=participant.id,
                original_filename=upload_file.filename,
                stored_filename=stored_filename,
                file_path=file_path,
                file_size_bytes=file_size,
                content_type=upload_file.content_type
            )
            db.add(new_sub)
            db.commit()
            db.refresh(new_sub)
            return new_sub

    @staticmethod
    def get_team_submission(event_id: uuid.UUID, db: Session, team_id: str):
        # Scope to event
        return db.query(ProjectSubmission).filter(
            ProjectSubmission.team_id == team_id,
            ProjectSubmission.event_id == event_id
        ).first()

    @staticmethod
    def get_download_file_for_evaluator(event_id: uuid.UUID, db: Session, evaluator: Evaluator, team_id: str):
        if not evaluator or not evaluator.is_active:
            raise HTTPException(status_code=403, detail="Evaluator not active.")
            
        from app.models.participant import Team
        from app.models.assignment import EvaluatorTeamAssignment
        
        # Scope team to event
        team = db.query(Team).filter(
            Team.id == team_id,
            Team.event_id == event_id
        ).first()
        
        if not team:
            raise HTTPException(status_code=404, detail="Team not found in this event.")
        
        # Scope assignment to event
        assignment = db.query(EvaluatorTeamAssignment).filter_by(
            evaluator_id=evaluator.id,
            team_id=team_id,
            event_id=event_id
        ).first()
        
        if not assignment:
            raise HTTPException(status_code=403, detail="Not authorized to access this team's submission. You are not assigned to this team.")
            
        # Scope submission to event
        submission = db.query(ProjectSubmission).filter(
            ProjectSubmission.team_id == team_id,
            ProjectSubmission.event_id == event_id
        ).first()
        
        if not submission:
            raise HTTPException(status_code=404, detail="No project submission found for this team.")
            
        if not os.path.exists(submission.file_path):
            raise HTTPException(status_code=404, detail="Submission file missing from server.")
            
        return submission