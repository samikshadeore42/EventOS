import sys
sys.path.append('.')
from app.core.database import Base
import app.models

print([t for t in Base.metadata.tables.keys() if "stage" in t or "notification" in t])
