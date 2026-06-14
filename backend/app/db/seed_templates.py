# backend/app/db/seed_templates.py
from app.core.database import SessionLocal
from app.models.template import Template
import uuid

def seed_templates():
    db = SessionLocal()
    try:
        # Define your core blueprints
        templates = [
            {
                "name": "Hackathon",
                "default_capabilities": ["teams", "mentors", "evaluators", "problem_statements", "submissions", "weighted_scoring"],
                "suggested_stages": [{"name": "Registration", "ratio": 0.2}, {"name": "Hacking", "ratio": 0.6}, {"name": "Judging", "ratio": 0.2}],
                "required_roles": ["participant", "team_lead", "mentor", "judge"]
            },
            {
                "name": "Coding Contest",
                "default_capabilities": ["problem_statements", "submissions", "live_scoring", "risk_monitoring"],
                "suggested_stages": [{"name": "Warmup", "ratio": 0.1}, {"name": "Coding", "ratio": 0.8}, {"name": "Review", "ratio": 0.1}],
                "required_roles": ["participant", "admin"]
            }
        ]

        for t_data in templates:
            # Check if template already exists to avoid duplicates
            exists = db.query(Template).filter(Template.name == t_data["name"]).first()
            if not exists:
                new_template = Template(
                    id=uuid.uuid4(),
                    name=t_data["name"],
                    is_system_template=True,
                    default_capabilities=t_data["default_capabilities"],
                    suggested_stages=t_data["suggested_stages"],
                    required_roles=t_data["required_roles"]
                )
                db.add(new_template)
        
        db.commit()
        print("[SEEDER] System templates seeded successfully.")
    except Exception as e:
        print(f"[SEEDER] Failed to seed templates: {e}")
        db.rollback()
    finally:
        db.close()