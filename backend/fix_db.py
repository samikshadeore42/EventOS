from sqlalchemy import create_engine, text

# PASTE YOUR URL STRING HERE INSIDE THE QUOTES
DATABASE_URL = "postgresql://EventOS_user:EventOS_secret@localhost:5432/EventOS_db"

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    print("Clearing corrupted migration history...")
    conn.execute(text("DROP TABLE IF EXISTS alembic_version;"))
    conn.commit()
    print("Success! Table dropped.")