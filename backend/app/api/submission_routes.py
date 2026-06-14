# File: backend/app/api/submission_routes.py
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.event_scope import ScopedEventService, get_event_scope  # <-- Import Bouncer
from app.core.security import decode_access_token, get_token_subject, parse_uuid_subject
from app.models.participant import Participant
from app.models.evaluation import Evaluator
from app.services.project_submission_service import ProjectSubmissionService

# 1. Update Prefix
router = APIRouter(prefix="/events/{event_id}/submissions", tags=["Submissions"])

@router.post("/participant/project")
def submit_project(token: str, file: UploadFile = File(...), scope: ScopedEventService = Depends(get_event_scope)):
    payload = decode_access_token(token)
    role = payload.get("role")
    token_event_id = payload.get("event_id")

    # 2. Cryptographic event boundary check
    if str(token_event_id) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch. This link belongs to a different event.")

    if role != "participant":
        raise HTTPException(status_code=403, detail="Only participants can submit projects.")
        
    participant_id = parse_uuid_subject(get_token_subject(payload), "participant ID")
    
    # 3. DB scope check
    participant = scope.db.query(Participant).filter(
        Participant.id == participant_id,
        Participant.event_id == scope.event_id
    ).first()
    
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found in this event.")
        
    # Pass event_id to service layer
    submission = ProjectSubmissionService.save_team_submission(scope.event_id, scope.db, participant, file)
    
    return {
        "success": True,
        "message": "Project submitted successfully.",
        "submission": {
            "id": str(submission.id),
            "team_id": str(submission.team_id),
            "original_filename": submission.original_filename,
            "file_size_bytes": submission.file_size_bytes,
            "uploaded_by": f"{participant.first_name} {participant.last_name}",
            "created_at": submission.created_at.isoformat() if submission.created_at else None,
            "updated_at": submission.updated_at.isoformat() if submission.updated_at else None,
        }
    }

@router.get("/participant/project")
def get_participant_project(token: str, scope: ScopedEventService = Depends(get_event_scope)):
    payload = decode_access_token(token)
    role = payload.get("role")
    token_event_id = payload.get("event_id")

    if str(token_event_id) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch.")

    if role != "participant":
        raise HTTPException(status_code=403, detail="Only participants can access this.")
        
    participant_id = parse_uuid_subject(get_token_subject(payload), "participant ID")
    participant = scope.db.query(Participant).filter(
        Participant.id == participant_id,
        Participant.event_id == scope.event_id
    ).first()
    
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")
        
    if not participant.team_id:
        return {"submission": None, "message": "No project submitted yet."}
        
    submission = ProjectSubmissionService.get_team_submission(scope.event_id, scope.db, participant.team_id)
    if not submission:
        return {"submission": None, "message": "No project submitted yet."}
        
    uploader = scope.db.query(Participant).filter(
        Participant.id == submission.uploaded_by_participant_id,
        Participant.event_id == scope.event_id
    ).first()
    uploader_name = f"{uploader.first_name} {uploader.last_name}" if uploader else "Unknown"
        
    return {
        "submission": {
            "id": str(submission.id),
            "team_id": str(submission.team_id),
            "original_filename": submission.original_filename,
            "file_size_bytes": submission.file_size_bytes,
            "uploaded_by": uploader_name,
            "created_at": submission.created_at.isoformat() if submission.created_at else None,
            "updated_at": submission.updated_at.isoformat() if submission.updated_at else None,
        }
    }

@router.get("/team/{team_id}")
def get_team_submission_judge(team_id: UUID, token: str, scope: ScopedEventService = Depends(get_event_scope)):
    payload = decode_access_token(token)
    role = payload.get("role")
    token_event_id = payload.get("event_id")

    if str(token_event_id) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch.")

    if role != "evaluator":
        raise HTTPException(status_code=403, detail="Only evaluators can access this.")
        
    evaluator_id = parse_uuid_subject(get_token_subject(payload), "evaluator ID")
    evaluator = scope.db.query(Evaluator).filter(
        Evaluator.id == evaluator_id,
        Evaluator.event_id == scope.event_id
    ).first()
    if not evaluator:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
    
    submission = ProjectSubmissionService.get_download_file_for_evaluator(scope.event_id, scope.db, evaluator, team_id)
    
    uploader = scope.db.query(Participant).filter(
        Participant.id == submission.uploaded_by_participant_id,
        Participant.event_id == scope.event_id
    ).first()
    uploader_name = f"{uploader.first_name} {uploader.last_name}" if uploader else "Unknown"
    
    return {
        "submission": {
            "id": str(submission.id),
            "team_id": str(submission.team_id),
            "original_filename": submission.original_filename,
            "file_size_bytes": submission.file_size_bytes,
            "uploaded_by": uploader_name,
            "created_at": submission.created_at.isoformat() if submission.created_at else None,
            "updated_at": submission.updated_at.isoformat() if submission.updated_at else None,
        }
    }

@router.get("/team/{team_id}/download")
def download_team_submission(team_id: UUID, token: str, scope: ScopedEventService = Depends(get_event_scope)):
    payload = decode_access_token(token)
    role = payload.get("role")
    token_event_id = payload.get("event_id")

    if str(token_event_id) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch.")

    if role != "evaluator":
        raise HTTPException(status_code=403, detail="Only evaluators can download this.")
        
    evaluator_id = parse_uuid_subject(get_token_subject(payload), "evaluator ID")
    evaluator = scope.db.query(Evaluator).filter(
        Evaluator.id == evaluator_id,
        Evaluator.event_id == scope.event_id
    ).first()
    if not evaluator:
        raise HTTPException(status_code=404, detail="Evaluator not found.")
    
    submission = ProjectSubmissionService.get_download_file_for_evaluator(scope.event_id, scope.db, evaluator, team_id)
    
    return FileResponse(
        path=submission.file_path,
        filename=submission.original_filename,
        media_type=submission.content_type or "application/zip"
    )