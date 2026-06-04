import os
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.admin import Employee, Admin
from app.core.security import get_password_hash, verify_password

def bootstrap():
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD")
    
    if not password:
        raise RuntimeError("ADMIN_PASSWORD environment variable is required for admin bootstrap.")
        
    emp_id = os.environ.get("ADMIN_EMPLOYEE_ID", "EMP004")
    emp_name = os.environ.get("ADMIN_EMPLOYEE_NAME", "Bhavika")
    reset_pass = os.environ.get("RESET_ADMIN_PASSWORD", "false").lower() == "true"
    
    db: Session = SessionLocal()
    try:
        # Check employee
        employee = db.query(Employee).filter(Employee.employee_id == emp_id).first()
        if not employee:
            employee = Employee(employee_id=emp_id, name=emp_name)
            db.add(employee)
            db.flush()
            print(f"Created employee {emp_id}")
        else:
            print(f"Employee {emp_id} already exists.")
            
        # Check admin
        admin = db.query(Admin).filter(Admin.username == username).first()
        if not admin:
            hashed = get_password_hash(password)
            admin = Admin(username=username, employee_id=emp_id, hashed_password=hashed)
            db.add(admin)
            print(f"Created admin user '{username}'")
        else:
            # Check if hash is invalid or needs reset
            is_valid = verify_password(password, admin.hashed_password)
            if not is_valid or reset_pass:
                admin.hashed_password = get_password_hash(password)
                print(f"Updated password hash for admin user '{username}'")
            else:
                print(f"Admin user '{username}' already exists with a valid password.")
                
        db.commit()
        print("Bootstrap complete.")
    except Exception as e:
        print(f"Error bootstrapping admin: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    bootstrap()
