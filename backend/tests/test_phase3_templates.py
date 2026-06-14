def test_required_system_templates_exist(db_session):
    from app.db.seed_templates import seed_templates
    from app.models.template import Template

    seed_templates()
    keys = {t.key for t in db_session.query(Template).all()}

    assert "generic_competitive_event" in keys
    assert "hackathon" in keys
    assert "coding_contest" in keys
    assert "case_competition" in keys
    assert "sports_tournament" in keys


def test_template_capabilities_are_registered(db_session):
    from app.core.capabilities import CAPABILITY_REGISTRY
    from app.db.seed_templates import seed_templates
    from app.models.template import Template

    seed_templates()
    for template in db_session.query(Template).all():
        for capability in template.default_capabilities:
            assert capability in CAPABILITY_REGISTRY


def test_unknown_event_type_falls_back_to_generic(client):
    template_resp = client.get("/templates")
    assert template_resp.status_code == 200

    resp = client.post(
        "/events",
        json={
            "name": "Custom Unknown Event",
            "slug": "custom-unknown-event",
            "event_type": "unknown_custom_type",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["event_type"] == "generic_competitive_event"
    assert data["active_capabilities"]


def test_template_config_is_copied_to_event(client):
    templates = client.get("/templates").json()
    hackathon = next(t for t in templates if t["key"] == "hackathon")

    resp = client.post(
        "/events",
        json={
            "name": "Template Copy Event",
            "slug": "template-copy-event",
            "template_id": hackathon["id"],
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["template_id"] == hackathon["id"]
    assert data["template_version"] == hackathon["version"]
    assert data["active_capabilities"] == hackathon["default_capabilities"]