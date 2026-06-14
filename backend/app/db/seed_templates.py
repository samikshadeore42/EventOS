# File: backend/app/db/seed_templates.py
import uuid

from app.core.capabilities import validate_capabilities
from app.core.database import SessionLocal
from app.models.template import Template


SYSTEM_TEMPLATES = [
    {
        "key": "generic_competitive_event",
        "name": "Generic Competitive Event",
        "event_type_label": "generic_competitive_event",
        "description": "Fallback template for custom competitive events.",
        "default_capabilities": ["teams", "evaluators", "submissions", "weighted_scoring"],
        "suggested_stages": [
            {"key": "registration", "name": "Registration", "ratio": 0.2},
            {"key": "competition", "name": "Competition", "ratio": 0.6},
            {"key": "evaluation", "name": "Evaluation", "ratio": 0.2},
        ],
        "required_roles": ["participant", "evaluator", "admin"],
    },
    {
        "key": "hackathon",
        "name": "Hackathon",
        "event_type_label": "hackathon",
        "description": "Team-based build event with mentors, submissions and judging.",
        "default_capabilities": ["teams", "mentors", "evaluators", "problem_statements", "submissions", "weighted_scoring", "risk_monitoring"],
        "suggested_stages": [
            {"key": "registration", "name": "Registration", "ratio": 0.2},
            {"key": "team_formation", "name": "Team Formation", "ratio": 0.15},
            {"key": "development", "name": "Development", "ratio": 0.45},
            {"key": "evaluation", "name": "Evaluation", "ratio": 0.15},
            {"key": "results", "name": "Results", "ratio": 0.05},
        ],
        "required_roles": ["participant", "mentor", "evaluator", "admin"],
    },
    {
        "key": "coding_contest",
        "name": "Coding Contest",
        "event_type_label": "coding_contest",
        "description": "Programming competition with submissions and live scoring.",
        "default_capabilities": ["problem_statements", "submissions", "live_scoring", "evaluators", "leaderboard"],
        "suggested_stages": [
            {"key": "registration", "name": "Registration", "ratio": 0.15},
            {"key": "coding", "name": "Coding Round", "ratio": 0.7},
            {"key": "review", "name": "Review", "ratio": 0.15},
        ],
        "required_roles": ["participant", "evaluator", "admin"],
    },
    {
        "key": "case_competition",
        "name": "Case Competition",
        "event_type_label": "case_competition",
        "description": "Case-solving event with presentation and evaluation.",
        "default_capabilities": ["teams", "submissions", "presentation_evaluation", "evaluators", "weighted_scoring"],
        "suggested_stages": [
            {"key": "registration", "name": "Registration", "ratio": 0.2},
            {"key": "case_solving", "name": "Case Solving", "ratio": 0.5},
            {"key": "presentation", "name": "Presentation", "ratio": 0.2},
            {"key": "results", "name": "Results", "ratio": 0.1},
        ],
        "required_roles": ["participant", "evaluator", "admin"],
    },
    {
        "key": "sports_tournament",
        "name": "Sports Tournament",
        "event_type_label": "sports_tournament",
        "description": "Tournament event with matches, fixtures and elimination.",
        "default_capabilities": ["teams", "matches", "fixtures", "elimination", "live_scoring"],
        "suggested_stages": [
            {"key": "registration", "name": "Registration", "ratio": 0.2},
            {"key": "fixtures", "name": "Fixture Generation", "ratio": 0.1},
            {"key": "matches", "name": "Matches", "ratio": 0.6},
            {"key": "results", "name": "Results", "ratio": 0.1},
        ],
        "required_roles": ["participant", "admin"],
    },
]


def seed_templates():
    db = SessionLocal()
    try:
        for item in SYSTEM_TEMPLATES:
            capabilities = validate_capabilities(item["default_capabilities"])
            existing = db.query(Template).filter(
                Template.key == item["key"],
                Template.version == 1,
            ).first()

            if existing:
                existing.name = item["name"]
                existing.description = item["description"]
                existing.event_type_label = item["event_type_label"]
                existing.default_capabilities = capabilities
                existing.suggested_stages = item["suggested_stages"]
                existing.required_roles = item["required_roles"]
                existing.is_system_template = True
            else:
                db.add(Template(
                    id=uuid.uuid4(),
                    key=item["key"],
                    name=item["name"],
                    description=item["description"],
                    event_type_label=item["event_type_label"],
                    version=1,
                    is_system_template=True,
                    organization_id=None,
                    default_capabilities=capabilities,
                    suggested_stages=item["suggested_stages"],
                    required_roles=item["required_roles"],
                ))

        db.commit()
        print("[SEEDER] System templates seeded successfully.")
    except Exception as e:
        db.rollback()
        print(f"[SEEDER] Failed to seed templates: {e}")
    finally:
        db.close()