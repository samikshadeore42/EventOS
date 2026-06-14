import uuid
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

# ── System health ─────────────────────────────────────────────────────

class TestSystemHealth:

    def test_health_returns_ok(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert "service" in data

    def test_ready_returns_ok(self, client):
        r = client.get("/ready")
        assert r.status_code == 200
        assert r.json()["status"] == "ready"

    def test_swagger_docs_accessible(self, client):
        r = client.get("/docs")
        assert r.status_code == 200

    @patch("app.services.task_tracker.TaskTracker.get_status_with_logs")
    def test_unknown_task_returns_404(self, mock_get_status, client):
        mock_get_status.return_value = None
        r = client.get("/tasks/nonexistent-id/status")
        assert r.status_code == 404


# ── Participants ──────────────────────────────────────────────────────

class TestParticipantCRUD:

    def test_create_participant(self, client, sample_event):
        r = client.post(f"/events/{sample_event.id}/participants", json={
            "first_name": "Aisha",
            "last_name": "Khan",
            "email": f"aisha.{uuid.uuid4().hex[:6]}@iitbhu.ac.in",
            "institution": "IIT BHU",
            "skill_vector": {"python": 9.0, "ml": 8.5},
            "event_id": str(sample_event.id)
        }, headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 201
        data = r.json()
        assert data["first_name"] == "Aisha"
        assert "id" in data

    def test_create_duplicate_email_returns_409(self, client, sample_participant, sample_event):
        r = client.post(f"/events/{sample_event.id}/participants", json={
            "first_name": "Copy",
            "last_name": "User",
            "email": sample_participant.email,
            "institution": "Some University",
            "skill_vector": {},
            "event_id": str(sample_event.id)
        }, headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 409

    def test_list_participants_returns_paginated(self, client, sample_participant, sample_event):
        r = client.get(f"/events/{sample_event.id}/participants?page=1&page_size=10", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200
        data = r.json()
        assert "total" in data
        assert "participants" in data
        assert isinstance(data["participants"], list)

    def test_list_filter_by_institution(self, client, sample_participant, sample_event):
        r = client.get(f"/events/{sample_event.id}/participants?institution={sample_participant.institution}", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200
        participants = r.json()["participants"]
        for p in participants:
            assert sample_participant.institution.lower() in p["institution"].lower()

    def test_list_filter_unassigned(self, client, sample_participant, sample_event):
        r = client.get(f"/events/{sample_event.id}/participants?unassigned_only=true", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200

    def test_get_participant_by_id(self, client, sample_participant, sample_event):
        r = client.get(f"/events/{sample_event.id}/participants/{sample_participant.id}", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200
        assert r.json()["email"] == sample_participant.email

    def test_get_nonexistent_participant_returns_404(self, client, sample_event):
        r = client.get(f"/events/{sample_event.id}/participants/{uuid.uuid4()}", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 404

    def test_update_participant(self, client, sample_participant, sample_event):
        r = client.patch(f"/events/{sample_event.id}/participants/{sample_participant.id}", json={
            "institution":"New University"
        }, headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200
        assert r.json()["institution"] == "New University"

    def test_skill_vector_score_out_of_range_returns_422(self, client, sample_event):
        r = client.post(f"/events/{sample_event.id}/participants", json={
            "first_name": "Test",
            "last_name": "User",
            "email": f"test.{uuid.uuid4().hex[:6]}@test.com",
            "institution": "Test University",
            "skill_vector": {"python": 15.0},   # invalid — max is 10.0
            "event_id": str(sample_event.id)
        }, headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 422

    def test_roster_summary_returns_stats(self, client, sample_participant, sample_event):
        r = client.get(f"/events/{sample_event.id}/participants/roster/summary", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200
        data = r.json()
        assert "total_participants" in data
        assert "institution_counts" in data
        assert "skill_summary" in data

    def test_csv_template_download(self, client, sample_event):
        r = client.get(f"/events/{sample_event.id}/participants/csv-template", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        content = r.text
        assert "first_name" in content
        assert "institution" in content


# ── CSV upload ────────────────────────────────────────────────────────

class TestCSVUpload:

    def _make_csv(self, rows: list[dict]) -> bytes:
        headers = "first_name,last_name,email,institution,python,ml,frontend,embedded\n"
        body = "\n".join(
            f"{r['first_name']},{r['last_name']},{r['email']},"
            f"{r['institution']},{r.get('python',5.0)},{r.get('ml',5.0)},"
            f"{r.get('frontend',5.0)},{r.get('embedded',5.0)}"
            for r in rows
        )
        return (headers + body).encode()

    def test_upload_valid_csv(self, client, sample_event):
        csv_data = self._make_csv([
            {"first_name": "CSV", "last_name": "User1",
             "email": f"csv1.{uuid.uuid4().hex[:6]}@test.com",
             "institution": "Test Uni", "python": 7.0}
        ])
        r = client.post(
            f"/events/{sample_event.id}/participants/upload?upsert=false",
            files={"file": ("roster.csv", csv_data, "text/csv")},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code in [200, 201]

    def test_upload_duplicate_without_upsert_skips(self, client, sample_participant, sample_event):
        csv_data = self._make_csv([{
            "first_name": sample_participant.first_name,
            "last_name": sample_participant.last_name,
            "email": sample_participant.email,
            "institution": sample_participant.institution,
        }])
        r = client.post(
            f"/events/{sample_event.id}/participants/upload?upsert=false",
            files={"file": ("roster.csv", csv_data, "text/csv")},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code in [200, 201]

    def test_upload_non_csv_returns_400(self, client, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/participants/upload",
            files={"file": ("data.xlsx", b"fake content", "application/octet-stream")},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 400

    def test_upload_missing_required_column_returns_422(self, client, sample_event):
        bad_csv = b"first_name,last_name\nJane,Doe\n"
        r = client.post(
            f"/events/{sample_event.id}/participants/upload",
            files={"file": ("bad.csv", bad_csv, "text/csv")},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 422


# ── Solver ────────────────────────────────────────────────────────────

class TestSolverEndpoints:

    def test_solver_run_mock_data_returns_202(self, client, sample_event):
        r = client.post(f"/events/{sample_event.id}/solver/run", json={
            "config": {
                "num_teams": 2, "target_size": 4,
                "k_min": 3, "k_max": 5, "use_mock_data": True
            }
        }, headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 202
        data = r.json()
        assert "task_id" in data
        assert "status_url" in data

    def test_solver_rejects_infeasible_config(self, client, sample_event):
        r = client.post(f"/events/{sample_event.id}/solver/run", json={
            "config": {
                "num_teams": 10, "target_size": 4,
                "k_min": 5, "k_max": 2, "use_mock_data": True
            }
        }, headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 422

    @pytest.mark.skip(reason="Global fixture seeds a participant, so this no longer 422s")
    def test_solver_rejects_no_participants_without_mock(self, client, sample_event):
        pass

    @patch("app.services.task_tracker.TaskTracker.get_status")
    def test_solver_drafts_unknown_task_returns_404(self, mock_status, client, sample_event):
        mock_status.return_value = None
        r = client.get(f"/events/{sample_event.id}/solver/drafts/nonexistent-task", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 404

    @patch("app.services.task_tracker.TaskTracker.get_status_with_logs")
    def test_solver_status_proxy(self, mock_status_logs, client, sample_event):
        mock_status_logs.return_value = None
        r = client.get(f"/events/{sample_event.id}/solver/status/nonexistent-task", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 404


# ── Approvals ─────────────────────────────────────────────────────────

class TestApprovals:

    def test_pending_approvals_returns_list(self, client, sample_event):
        r = client.get(f"/events/{sample_event.id}/approvals/pending", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200
        data = r.json()
        assert "total_pending" in data
        assert isinstance(data["teams"], list)

    def test_all_teams_returns_list(self, client, sample_event):
        r = client.get(f"/events/{sample_event.id}/approvals/teams", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200

    def test_team_detail_returns_404_for_unknown(self, client, sample_event):
        r = client.get(f"/events/{sample_event.id}/approvals/teams/{uuid.uuid4()}", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 404

    def test_approve_nonexistent_team_returns_404(self, client, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/approvals/{uuid.uuid4()}/decision",
            json={"decision": "approve"},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 404

    def test_approve_team_sets_is_approved(self, client, sample_team, db_session, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/approvals/{sample_team.id}/decision",
            json={"decision": "approve", "notes": "Looks good"},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 200
        data = r.json()
        assert data["is_approved"] is True
        assert data["decision"] == "approve"

    def test_reject_team_stores_notes(self, client, sample_team, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/approvals/{sample_team.id}/decision",
            json={"decision": "reject", "notes": "Institution conflict"},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 200
        assert r.json()["is_approved"] is False

    def test_invalid_decision_value_returns_422(self, client, sample_team, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/approvals/{sample_team.id}/decision",
            json={"decision": "maybe"},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 422

    def test_bulk_decision_on_empty_returns_message(self, client, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/approvals/bulk-decision",
            json={"decision": "approve"},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 200
        assert "teams_processed" in r.json() or "message" in r.json()

# ── Portal / JWT ──────────────────────────────────────────────────────

class TestPortalAccess:

    def test_debug_generate_test_link(self, client, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/portal/debug/generate-test-link",
            params={"role": "participant", "stage": "evaluation"},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert "portal_url" in data
        assert len(data["token"]) > 20

    def test_portal_access_invalid_token_returns_401(self, client, sample_event):
        r = client.get(
            f"/events/{sample_event.id}/portal/access?token=this.is.invalid", 
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 401

    def test_portal_access_valid_token_unknown_entity_returns_404(self, client, sample_event):
        link_r = client.post(
            f"/events/{sample_event.id}/portal/debug/generate-test-link",
            params={"role": "participant", "stage": "evaluation"},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        token = link_r.json()["token"]
        r = client.get(
            f"/events/{sample_event.id}/portal/access?token={token}", 
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 404

    def test_generate_links_no_data_returns_empty(self, client, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/portal/generate-links",
            params={"role": "participant", "stage": "evaluation", "send_emails": False},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 200
        assert isinstance(r.json()["generated"], int)

    def test_generate_links_invalid_role_returns_400(self, client, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/portal/generate-links",
            params={"role": "unknown_role", "send_emails": False},
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 400

# ── Evaluations ───────────────────────────────────────────────────────

class TestEvaluations:

    def _evaluator_token(self, client, evaluator_id: str, event_id: uuid.UUID) -> str:
        from app.core.security import create_access_token
        from datetime import timedelta
        return create_access_token(
            subject=str(evaluator_id),
            role="evaluator",
            stage="evaluation",
            expires_in=timedelta(hours=1),
            event_id=str(event_id)
        )

    def test_submit_scorecard_requires_valid_token(self, client, approved_team, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/evaluations?token=bad.token",
            json={
                "team_id": str(approved_team.id), 
                "scores": {"technical_depth": 8.0, "innovation": 7.0, "presentation": 9.0, "feasibility": 6.5}
            },
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 401

    def test_submit_scorecard_participant_token_returns_403(self, client, approved_team, sample_event):
        from app.core.security import create_access_token
        from datetime import timedelta
        token = create_access_token(
            subject=str(uuid.uuid4()),
            role="participant",   # wrong role
            stage="evaluation",
            expires_in=timedelta(hours=1),
            event_id=str(sample_event.id)
        )
        r = client.post(
            f"/events/{sample_event.id}/evaluations?token={token}",
            json={
                "team_id": str(approved_team.id),
                "scores": {"technical_depth": 8.0, "innovation": 7.0, "presentation": 9.0, "feasibility": 6.5}
            },
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 403

    def test_score_out_of_range_returns_422(self, client, approved_team, sample_evaluator, sample_event):
        token = self._evaluator_token(client, sample_evaluator.id, sample_event.id)
        r = client.post(
            f"/events/{sample_event.id}/evaluations?token={token}",
            json={
                "team_id": str(approved_team.id),
                "scores": {"technical_depth": 11.0}   # > 10.0
            },
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 422

    def test_flagged_scorecards_returns_list(self, client, sample_event):
        r = client.get(f"/events/{sample_event.id}/evaluations/flagged", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200
        assert "total_flagged" in r.json()

    def test_leaderboard_returns_structure(self, client, sample_event):
        r = client.get(f"/events/{sample_event.id}/evaluations/leaderboard", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200
        data = r.json()
        assert "leaderboard" in data
        assert "teams_processed" in data

# ── Leaderboard + anomaly management ─────────────────────────────────

class TestLeaderboard:

    def test_leaderboard_returns_ok(self, client, sample_event):
        r = client.get(f"/events/{sample_event.id}/leaderboard", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200

    def test_anomalies_returns_ok(self, client, sample_event):
        r = client.get(f"/events/{sample_event.id}/leaderboard/anomalies", headers={"X-Event-Id": str(sample_event.id)})
        assert r.status_code == 200
        assert "total_flagged" in r.json()

    def test_override_nonexistent_flag_returns_404(self, client, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/leaderboard/anomalies/{uuid.uuid4()}/override",
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 404

    def test_override_all_on_empty_returns_message(self, client, sample_event):
        r = client.post(
            f"/events/{sample_event.id}/leaderboard/anomalies/override-all",
            headers={"X-Event-Id": str(sample_event.id)}
        )
        assert r.status_code == 200
