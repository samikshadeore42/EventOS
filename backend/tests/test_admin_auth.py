import pytest
from app.core.security import verify_password
from app.models.admin import Admin, Employee

def test_verify_password_invalid_hash_returns_false():
    assert verify_password("not-a-real-test-value", "corrupted_hash") is False
    assert verify_password("not-a-real-test-value", "") is False
    assert verify_password("", "valid_hash") is False

def test_admin_login_corrupted_hash(client, db_session):
    emp = Employee(employee_id="EMP999", name="Test Admin")
    db_session.add(emp)
    db_session.commit()
    
    admin = Admin(username="badadmin", employee_id="EMP999", hashed_password="not_a_valid_bcrypt_hash")
    db_session.add(admin)
    db_session.commit()
    
    response = client.post("/admin/login", json={
        "username": "badadmin",
        "password": "somepassword"
    })
    
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password."
