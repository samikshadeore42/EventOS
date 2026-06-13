from slowapi import Limiter
from slowapi.util import get_remote_address
import os

limiter = Limiter(key_func=get_remote_address, enabled=not os.getenv("DATABASE_URL", "").endswith("test.db"))
