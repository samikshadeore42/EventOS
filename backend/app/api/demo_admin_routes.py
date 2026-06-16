from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.demo_admin_service import get_demo_status, reset_demo_data
from pydantic import BaseModel

# NOTE: This is for local/demo/admin use only. Do not expose destructive reset controls publicly.
router = APIRouter(prefix="/demo-admin", tags=["Demo Admin"])

class ResetRequest(BaseModel):
    confirm: str
    preserve_admins: bool = True

@router.get("/status")
def get_demo_admin_status(db: Session = Depends(get_db)):
    return get_demo_status(db)

@router.post("/reset")
def reset_endpoint(req: ResetRequest, db: Session = Depends(get_db)): #, admin=Depends(get_current_admin)):
    # Using admin check can be enforced here if available, left commented out or implementable.
    if req.confirm != "RESET_DEMO_DATA":
        raise HTTPException(
            status_code=400,
            detail="Type RESET_DEMO_DATA to confirm demo reset."
        )
    
    try:
        deleted_counts = reset_demo_data(db, preserve_admins=req.preserve_admins)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Demo reset failed: {str(e)}"
        )
    
    return {
        "success": True,
        "deleted": deleted_counts,
        "message": "Demo data reset complete. Admin accounts were preserved."
    }
