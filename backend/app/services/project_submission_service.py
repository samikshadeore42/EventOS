import os
import shutil
import uuid
import zipfile
import io
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session

from app.models.participant import Participant, Team
from app.models.evaluation import Evaluator
from app.models.project_submission import ProjectSubmission
from app.services.notification_service import NotificationService
from app.schemas.notification import NotificationCreate
import logging

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "project_submissions"))
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

class ProjectSubmissionService:
    @staticmethod
    def validate_zip_upload(file: UploadFile):
        # Case-insensitive extension check
        if not (file.filename or "").lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="Only .zip project files are allowed.")
        
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)
        
        if size == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        
        if size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Project ZIP must be under 50MB.")

        # Verify the file is a genuine ZIP archive
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
    def save_team_submission(db: Session, participant: Participant, upload_file: UploadFile):
        if not participant.team_id:
            raise HTTPException(status_code=422, detail="You must be assigned to a team before submitting a project.")

        file_size = ProjectSubmissionService.validate_zip_upload(upload_file)

        os.makedirs(UPLOAD_DIR, exist_ok=True)
        
        ext = ".zip"
        unique_id = f"{participant.team_id}_{uuid.uuid4().hex}"
        stored_filename = f"{unique_id}{ext}"
        file_path = os.path.join(UPLOAD_DIR, stored_filename)

        with open(file_path, "wb") as f:
            shutil.copyfileobj(upload_file.file, f)
            
        existing_sub = db.query(ProjectSubmission).filter(ProjectSubmission.team_id == participant.team_id).first()
        
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
            ret_sub = existing_sub
        else:
            new_sub = ProjectSubmission(
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
            ret_sub = new_sub

        try:
            team = db.query(Team).filter(Team.id == participant.team_id).first()
            team_name = team.team_name if team else str(participant.team_id)
            NotificationService.create_notification(
                db, 
                NotificationCreate(
                    user_id="all",
                    message=f"Team '{team_name}' submitted their project zip archive.",
                    type="system"
                )
            )
        except Exception as e:
            logging.error(f"Failed to send project submission notification: {e}")

        return ret_sub

    @staticmethod
    def get_team_submission(db: Session, team_id: str):
        return db.query(ProjectSubmission).filter(ProjectSubmission.team_id == team_id).first()

    @staticmethod
    def get_download_file_for_evaluator(db: Session, evaluator: Evaluator, team_id: str):
        if not evaluator or not evaluator.is_active:
            raise HTTPException(status_code=403, detail="Evaluator not active.")
            
        from app.models.participant import Team
        from app.models.assignment import EvaluatorTeamAssignment
        
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found.")
        
        # Only allow download if this evaluator is assigned to this team
        assignment = db.query(EvaluatorTeamAssignment).filter_by(
            evaluator_id=evaluator.id,
            team_id=team_id
        ).first()
        
        if not assignment:
            raise HTTPException(status_code=403, detail="Not authorized to access this team's submission. You are not assigned to this team.")
            
        submission = db.query(ProjectSubmission).filter(ProjectSubmission.team_id == team_id).first()
        if not submission:
            raise HTTPException(status_code=404, detail="No project submission found for this team.")
            
        if not os.path.exists(submission.file_path):
            raise HTTPException(status_code=404, detail="Submission file missing from server.")
            
        return submission
