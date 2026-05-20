# File: backend/app/models/__init__.py
from app.models import participant   
from app.models import evaluation    
from app.models.participant import Participant, Team

__all__ = ["Participant", "Team"]
