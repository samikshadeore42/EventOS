# File: backend/app/api/submission_routes.py
from uuid import UUID
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.capabilities import require_capability
from app.services.event_scope import ScopedEventService
from app.core.security import decode_access_token, get_token_subject, parse_uuid_subject
from app.models.participant import Participant, Team
from app.models.evaluation import Evaluator
from app.services.project_submission_service import ProjectSubmissionService
from app.models.assignment import EvaluatorTeamAssignment
from app.services.portal_notification_service import notify_evaluator
from app.models.stage_definition import StageDefinition
from app.models.stage_run import StageRun
from app.models.project_submission import ProjectSubmission

# 1. Update Prefix
router = APIRouter(prefix="/events/{event_id}/submissions", tags=["Submissions"])

def _parse_team_uuid(team_id: str) -> UUID:
    try:
        return UUID(str(team_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid team id.")

@router.post("/participant/project")
def submit_project(
    token: str,
    file: UploadFile | None = File(default=None),
    project_file: UploadFile | None = File(default=None),
    upload: UploadFile | None = File(default=None),
    scope: ScopedEventService = Depends(require_capability("submissions")),
):
    upload_file = file or project_file or upload
    if upload_file is None:
        raise HTTPException(
            status_code=422,
            detail="Upload field is required. Send the ZIP as multipart field 'file'.",
        )
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

    active_stage = (
        scope.db.query(StageDefinition)
        .join(
            StageRun,
            (StageRun.stage_definition_id == StageDefinition.id)
            & (StageRun.event_id == StageDefinition.event_id),
        )
        .filter(
            StageDefinition.event_id == scope.event_id,
            StageRun.status == "active",
        )
        .first()
    )

    if active_stage and active_stage.key != "development":
        raise HTTPException(
            status_code=403,
            detail="Project submission is allowed only during the Development stage.",
        )
        
    # Pass event_id to service layer
    submission = ProjectSubmissionService.save_team_submission(scope.event_id, scope.db, participant, upload_file)
    assignments = scope.db.query(EvaluatorTeamAssignment).filter(
        EvaluatorTeamAssignment.event_id == scope.event_id,
        EvaluatorTeamAssignment.team_id == participant.team_id,
    ).all()

    team = scope.db.query(Team).filter(
        Team.event_id == scope.event_id,
        Team.id == participant.team_id,
    ).first()

    team_name = team.team_name if team else "Team"

    for assignment in assignments:
        notify_evaluator(
            scope.db,
            event_id=scope.event_id,
            evaluator_id=assignment.evaluator_id,
            notification_type="evaluator_team_submission",
            title="Final project submitted",
            message=f"Team {team_name} submitted their final project.",
            dedupe_key=f"evaluator-submission:{scope.event_id}:{assignment.evaluator_id}:{submission.id}",
        )
    
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
def get_participant_project(token: str, scope: ScopedEventService = Depends(require_capability("submissions"))):
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
def get_team_submission_for_evaluator(
    team_id: str,
    token: str,
    scope: ScopedEventService = Depends(require_capability("submissions")),
):
    team_uuid = _parse_team_uuid(team_id)
    payload = decode_access_token(token)

    if payload.get("role") != "evaluator":
        raise HTTPException(status_code=403, detail="Only evaluators can view team submissions.")

    if str(payload.get("event_id")) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch.")

    evaluator_id = parse_uuid_subject(get_token_subject(payload), "evaluator ID")

    assignment = scope.db.query(EvaluatorTeamAssignment).filter(
        EvaluatorTeamAssignment.event_id == scope.event_id,
        EvaluatorTeamAssignment.evaluator_id == evaluator_id,
        EvaluatorTeamAssignment.team_id == team_uuid,
    ).first()

    if not assignment:
        raise HTTPException(status_code=403, detail="You are not assigned to this team.")

    submission = scope.db.query(ProjectSubmission).filter(
        ProjectSubmission.event_id == scope.event_id,
        ProjectSubmission.team_id == team_uuid,
    ).order_by(ProjectSubmission.updated_at.desc(), ProjectSubmission.created_at.desc()).first()

    if not submission:
        return {
            "submission": None,
            "message": "No project ZIP submitted yet.",
        }

    return {
        "submission": {
            "id": str(submission.id),
            "team_id": str(submission.team_id),
            "original_filename": submission.original_filename,
            "file_size_bytes": submission.file_size_bytes,
            "created_at": submission.created_at.isoformat() if submission.created_at else None,
            "updated_at": submission.updated_at.isoformat() if submission.updated_at else None,
        }
    }

@router.get("/team/{team_id}/download")
def download_team_submission_for_evaluator(
    team_id: str,
    token: str,
    scope: ScopedEventService = Depends(require_capability("submissions")),
):
    team_uuid = _parse_team_uuid(team_id)
    payload = decode_access_token(token)

    if payload.get("role") != "evaluator":
        raise HTTPException(status_code=403, detail="Only evaluators can download team submissions.")

    if str(payload.get("event_id")) != str(scope.event_id):
        raise HTTPException(status_code=403, detail="Token mismatch.")

    evaluator_id = parse_uuid_subject(get_token_subject(payload), "evaluator ID")

    assignment = scope.db.query(EvaluatorTeamAssignment).filter(
        EvaluatorTeamAssignment.event_id == scope.event_id,
        EvaluatorTeamAssignment.evaluator_id == evaluator_id,
        EvaluatorTeamAssignment.team_id == team_uuid,
    ).first()

    if not assignment:
        raise HTTPException(status_code=403, detail="You are not assigned to this team.")

    submission = scope.db.query(ProjectSubmission).filter(
        ProjectSubmission.event_id == scope.event_id,
        ProjectSubmission.team_id == team_uuid,
    ).order_by(ProjectSubmission.updated_at.desc(), ProjectSubmission.created_at.desc()).first()

    if not submission:
        raise HTTPException(status_code=404, detail="No project ZIP submitted yet.")

        file_path = Path(submission.file_path)

    if not file_path.is_absolute():
        file_path = Path.cwd() / file_path

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Submitted project file is missing on the server. Please ask the participant to upload the ZIP again.",
        )

    return FileResponse(
        path=str(file_path),
        media_type="application/zip",
        filename=submission.original_filename or f"team_{team_uuid}_submission.zip",
    )