# File: backend/app/models/__init__.py
from app.models import participant   
from app.models import evaluation    
from app.models.participant import Participant, Team
from app.models import event_config 
from app.models import communication_log

__all__ = ["Participant", "Team"]
