# File: backend/app/core/database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

# Updated fallback to match the EventOS rebrand
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://EventOS_user:EventOS_secret@postgres:5432/EventOS_db"
)

# The engine is the actual connection to Postgres
# pool_pre_ping=True means SQLAlchemy checks if connection is alive before using it
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,        # max 10 connections open at once
    max_overflow=20,     # allow 20 extra connections in bursts
)

# SessionLocal is a factory — call it to get a new session
SessionLocal = sessionmaker(
    autocommit=False,   # we control when to commit
    autoflush=False,    # we control when to flush
    bind=engine
)

# Base class all our DB models will inherit from
class Base(DeclarativeBase):
    pass


# Dependency — used in FastAPI routes to get a DB session
# The `yield` makes it a context manager: opens session, yields it,
# then always closes it even if an error occurs
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
