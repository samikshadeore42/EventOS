import os
import pytest
from datetime import datetime, timedelta, timezone
from jose import jwt
from unittest.mock import patch
from fastapi import HTTPException
import sys

def test_missing_secret_fails_outside_test_mode():
    import importlib
    with patch('dotenv.load_dotenv'):
        with patch.dict(os.environ, clear=True):
            os.environ['TESTING'] = 'false'
            if 'app.core.security' in sys.modules:
                del sys.modules['app.core.security']
            with pytest.raises(ValueError, match="FATAL: JWT_SECRET_KEY environment variable must be set securely."):
                import app.core.security as security_module

def test_test_mode_injects_safe_secret():
    import importlib
    with patch('dotenv.load_dotenv'):
        with patch.dict(os.environ, clear=True):
            os.environ['TESTING'] = 'true'
            if 'app.core.security' in sys.modules:
                del sys.modules['app.core.security']
            import app.core.security as security_module
            assert security_module.JWT_SECRET_KEY == "test-secret"

def test_token_signed_with_wrong_secret_is_rejected():
    import importlib
    with patch('dotenv.load_dotenv'):
        with patch.dict(os.environ, clear=True):
            os.environ['TESTING'] = 'true'
            if 'app.core.security' in sys.modules:
                del sys.modules['app.core.security']
            import app.core.security as security_module
        
        # Token signed with "wrong-secret"
        now = datetime.now(timezone.utc)
        payload = {"sub": "test", "role": "admin", "stage": "eval", "iat": now, "exp": now + timedelta(hours=1)}
        wrong_token = jwt.encode(payload, "wrong-secret", algorithm=security_module.ALGORITHM)
        
        with pytest.raises(HTTPException) as excinfo:
            security_module.decode_access_token(wrong_token)
        assert excinfo.value.status_code == 401
        assert "Invalid or expired token" in str(excinfo.value.detail)

def test_malformed_token_is_rejected():
    import importlib
    with patch('dotenv.load_dotenv'):
        with patch.dict(os.environ, clear=True):
            os.environ['TESTING'] = 'true'
            if 'app.core.security' in sys.modules:
                del sys.modules['app.core.security']
            import app.core.security as security_module
        
        with pytest.raises(HTTPException) as excinfo:
            security_module.decode_access_token("this.is.malformed")
        assert excinfo.value.status_code == 401
        assert "Invalid or expired token" in str(excinfo.value.detail)

def test_expired_token_is_rejected():
    import importlib
    with patch('dotenv.load_dotenv'):
        with patch.dict(os.environ, clear=True):
            os.environ['TESTING'] = 'true'
            if 'app.core.security' in sys.modules:
                del sys.modules['app.core.security']
            import app.core.security as security_module
        
        # Create an expired token
        token = security_module.create_access_token("test", "admin", "eval", expires_in=timedelta(seconds=-1))
        
        with pytest.raises(HTTPException) as excinfo:
            security_module.decode_access_token(token)
        assert excinfo.value.status_code == 401
        assert "Invalid or expired token" in str(excinfo.value.detail)
