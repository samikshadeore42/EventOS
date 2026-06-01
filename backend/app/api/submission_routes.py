from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_access_token, get_token_subject
from app.models.participant import Participant
from app.models.evaluation import Evaluator
from app.services.project_submission_service import ProjectSubmissionService

router = APIRouter(prefix="/submissions", tags=["Submissions"])

@router.post("/participant/project")
def submit_project(token: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    payload = decode_access_token(token)
    role = payload.get("role")
    if role != "participant":
        raise HTTPException(status_code=403, detail="Only participants can submit projects.")
        
    participant_id = get_token_subject(payload)
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")
        
    submission = ProjectSubmissionService.save_team_submission(db, participant, file)
    
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
def get_participant_project(token: str, db: Session = Depends(get_db)):
    payload = decode_access_token(token)
    role = payload.get("role")
    if role != "participant":
        raise HTTPException(status_code=403, detail="Only participants can access this.")
        
    participant_id = get_token_subject(payload)
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")
        
    if not participant.team_id:
        return {"submission": None, "message": "No project submitted yet."}
        
    submission = ProjectSubmissionService.get_team_submission(db, participant.team_id)
    if not submission:
        return {"submission": None, "message": "No project submitted yet."}
        
    uploader = db.query(Participant).filter(Participant.id == submission.uploaded_by_participant_id).first()
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
def get_team_submission_judge(team_id: str, token: str, db: Session = Depends(get_db)):
    payload = decode_access_token(token)
    role = payload.get("role")
    if role != "evaluator":
        raise HTTPException(status_code=403, detail="Only evaluators can access this.")
        
    evaluator_id = get_token_subject(payload)
    evaluator = db.query(Evaluator).filter(Evaluator.id == evaluator_id).first()
    
    submission = ProjectSubmissionService.get_download_file_for_evaluator(db, evaluator, team_id)
    
    uploader = db.query(Participant).filter(Participant.id == submission.uploaded_by_participant_id).first()
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
def download_team_submission(team_id: str, token: str, db: Session = Depends(get_db)):
    payload = decode_access_token(token)
    role = payload.get("role")
    if role != "evaluator":
        raise HTTPException(status_code=403, detail="Only evaluators can download this.")
        
    evaluator_id = get_token_subject(payload)
    evaluator = db.query(Evaluator).filter(Evaluator.id == evaluator_id).first()
    
    submission = ProjectSubmissionService.get_download_file_for_evaluator(db, evaluator, team_id)
    
    return FileResponse(
        path=submission.file_path,
        filename=submission.original_filename,
        media_type=submission.content_type or "application/zip"
    )
