from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.admin import AdminSignup, AdminLogin, TokenResponse
from app.models.admin import Admin, Employee
from app.core.security import get_password_hash, verify_password, create_access_token, TokenRole

router = APIRouter(prefix="/admin", tags=["Admin Auth"])

@router.post("/signup", response_model=TokenResponse)
def signup(data: AdminSignup, db: Session = Depends(get_db)):
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")

    # 1. Verify Employee ID exists
    employee = db.query(Employee).filter(Employee.employee_id == data.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee ID not found in the system.")

    # 2. Verify Employee ID is not already registered
    existing_admin_emp = db.query(Admin).filter(Admin.employee_id == data.employee_id).first()
    if existing_admin_emp:
        raise HTTPException(status_code=400, detail="An admin account already exists for this Employee ID.")

    # 3. Verify Username is not taken
    existing_admin_user = db.query(Admin).filter(Admin.username == data.username).first()
    if existing_admin_user:
        raise HTTPException(status_code=400, detail="Username is already taken.")

    # 4. Create admin account
    hashed_password = get_password_hash(data.password)
    new_admin = Admin(
        username=data.username,
        employee_id=data.employee_id,
        hashed_password=hashed_password
    )
    db.add(new_admin)
    db.commit()
    db.refresh(new_admin)

    # Generate JWT
    token = create_access_token(
        subject=new_admin.username,
        role=TokenRole.ADMIN,
        stage="active"
    )
    return {"access_token": token, "token_type": "bearer"}

@router.post("/login", response_model=TokenResponse)
def login(data: AdminLogin, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.username == data.username).first()
    if not admin:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    
    if not verify_password(data.password, admin.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = create_access_token(
        subject=admin.username,
        role=TokenRole.ADMIN,
        stage="active"
    )
    return {"access_token": token, "token_type": "bearer"}
