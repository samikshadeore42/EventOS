# File: backend/tests/test_portal_workflow.py
# Regression tests for portal evaluation workflow fixes.
# Tests evaluator creation, assignment, conflict enforcement (with normalization),
# judge portal restrictions, submission upload/download auth,
# demo reset FK ordering, score_service institution field,
# exact score criteria validation, and ZIP archive validation.

import io
import uuid
import zipfile
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_evaluator(db_session, email="judge@test.com", institution=None):
    from app.models.evaluation import Evaluator
    e = Evaluator(
        first_name="Test",
        last_name="Judge",
        email=email,
        expertise_areas=["testing"],
        passed_out_institution=institution,
        is_active=True,
    )
    db_session.add(e)
    db_session.commit()
    db_session.refresh(e)
    return e


def make_approved_team(db_session, name="Team Test"):
    from app.models.participant import Team
    t = Team(team_name=name, rationale="Test", is_approved=True)
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return t


def make_participant_in_team(db_session, team, email="p@test.com", institution="BITS Pilani"):
    from app.models.participant import Participant
    p = Participant(
        first_name="Student",
        last_name="One",
        email=email,
        institution=institution,
        team_id=team.id,
        skill_vector={"python": 5.0},
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def assign_evaluator_to_team(db_session, evaluator, team):
    from app.models.assignment import EvaluatorTeamAssignment
    a = EvaluatorTeamAssignment(evaluator_id=evaluator.id, team_id=team.id)
    db_session.add(a)
    db_session.commit()


def make_evaluator_token(evaluator_id):
    """Create a mock JWT payload for an evaluator."""
    return {"sub": str(evaluator_id), "role": "evaluator"}


def make_participant_token(participant_id):
    """Create a mock JWT payload for a participant."""
    return {"sub": str(participant_id), "role": "participant"}


def make_valid_zip_bytes():
    """Create a genuine valid ZIP file in memory."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.md", "# Test Project\nThis is a test.")
    buf.seek(0)
    return buf.read()


# ── Test: Evaluator Creation with passed_out_institution ─────────────────────

class TestEvaluatorCreation:
    def test_create_evaluator_with_institution(self, client, db_session):
        """POST /evaluators should accept and store passed_out_institution."""
        resp = client.post("/evaluators", json={
            "first_name": "Dr. Test",
            "last_name": "Create",
            "email": f"create_{uuid.uuid4().hex[:8]}@test.com",
            "expertise_areas": ["ml"],
            "passed_out_institution": "IIT Madras",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["passed_out_institution"] == "IIT Madras"

    def test_create_evaluator_without_institution(self, client, db_session):
        """passed_out_institution should be optional (null by default)."""
        resp = client.post("/evaluators", json={
            "first_name": "Dr. No",
            "last_name": "Inst",
            "email": f"noinst_{uuid.uuid4().hex[:8]}@test.com",
            "expertise_areas": [],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["passed_out_institution"] is None


# ── Test: Evaluator Assignment ───────────────────────────────────────────────

class TestEvaluatorAssignment:
    def test_assign_evaluator_success(self, client, db_session):
        """POST /evaluators/assign should work for non-conflicting teams."""
        evaluator = make_evaluator(db_session, email=f"assign_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team NoConflict")
        
        resp = client.post("/evaluators/assign", json={
            "evaluator_id": str(evaluator.id),
            "team_ids": [str(team.id)],
        })
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

    def test_assign_evaluator_conflict_blocked(self, client, db_session):
        """Assignment should be blocked (422) when evaluator institution matches team member."""
        evaluator = make_evaluator(
            db_session,
            email=f"conflict_{uuid.uuid4().hex[:8]}@test.com",
            institution="BITS Pilani",
        )
        team = make_approved_team(db_session, name="Team Conflicting")
        make_participant_in_team(
            db_session, team,
            email=f"student_{uuid.uuid4().hex[:8]}@bits.ac.in",
            institution="BITS Pilani",
        )

        resp = client.post("/evaluators/assign", json={
            "evaluator_id": str(evaluator.id),
            "team_ids": [str(team.id)],
        })
        assert resp.status_code == 422
        assert "Conflict of interest" in resp.json()["detail"]

    def test_assign_evaluator_conflict_normalized(self, client, db_session):
        """Conflict check must be case-insensitive. 'iitl' == 'IITL'."""
        evaluator = make_evaluator(
            db_session,
            email=f"normconflict_{uuid.uuid4().hex[:8]}@test.com",
            institution="iitl",
        )
        team = make_approved_team(db_session, name="Team NormConflict")
        make_participant_in_team(
            db_session, team,
            email=f"student_{uuid.uuid4().hex[:8]}@iitl.ac.in",
            institution="IITL",
        )

        resp = client.post("/evaluators/assign", json={
            "evaluator_id": str(evaluator.id),
            "team_ids": [str(team.id)],
        })
        assert resp.status_code == 422
        assert "Conflict of interest" in resp.json()["detail"]

    def test_assign_evaluator_empty_institution_no_block(self, client, db_session):
        """Evaluator with no institution should not be blocked."""
        evaluator = make_evaluator(
            db_session,
            email=f"noinst_assign_{uuid.uuid4().hex[:8]}@test.com",
            institution=None,
        )
        team = make_approved_team(db_session, name="Team EmptyInst")
        make_participant_in_team(
            db_session, team,
            email=f"student_{uuid.uuid4().hex[:8]}@test.com",
            institution="IITL",
        )

        resp = client.post("/evaluators/assign", json={
            "evaluator_id": str(evaluator.id),
            "team_ids": [str(team.id)],
        })
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

    def test_get_evaluator_assignments(self, client, db_session):
        """GET /evaluators/{id}/assignments should return assigned teams."""
        evaluator = make_evaluator(db_session, email=f"getassign_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team Assigned")
        assign_evaluator_to_team(db_session, evaluator, team)

        resp = client.get(f"/evaluators/{evaluator.id}/assignments")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["teams"]) == 1
        assert data["teams"][0]["team_name"] == "Team Assigned"


# ── Test: Judge Portal Only Shows Assigned Teams ─────────────────────────────

class TestJudgePortalAssignment:
    @patch("app.services.link_service.decode_access_token")
    def test_evaluator_portal_returns_only_assigned_teams(self, mock_decode, client, db_session):
        """Portal access should return only teams assigned to this evaluator."""
        evaluator = make_evaluator(db_session, email=f"portal_{uuid.uuid4().hex[:8]}@test.com")
        team_assigned = make_approved_team(db_session, name="Team Assigned Portal")
        team_not_assigned = make_approved_team(db_session, name="Team NotAssigned")
        assign_evaluator_to_team(db_session, evaluator, team_assigned)

        mock_decode.return_value = {
            "sub": str(evaluator.id),
            "role": "evaluator",
            "stage": "evaluation",
        }

        resp = client.get("/portal/access", params={"token": "mock-token"})
        assert resp.status_code == 200
        data = resp.json()
        team_names = [t["team_name"] for t in data.get("assigned_teams", [])]
        assert "Team Assigned Portal" in team_names
        assert "Team NotAssigned" not in team_names


# ── Test: Score Submission Authorization ─────────────────────────────────────

class TestScoreSubmissionAuth:
    @patch("app.api.evaluation_routes.decode_access_token")
    def test_score_blocked_for_unassigned_team(self, mock_decode, client, db_session):
        """Score submission should be blocked for teams not assigned to the evaluator."""
        evaluator = make_evaluator(db_session, email=f"score_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team Unassigned Score")
        # Do NOT assign the evaluator to this team

        mock_decode.return_value = {
            "sub": str(evaluator.id),
            "role": "evaluator",
        }

        resp = client.post("/evaluations", params={"token": "mock-token"}, json={
            "team_id": str(team.id),
            "scores": {
                "technical_depth": 8.0,
                "innovation": 7.0,
                "presentation": 6.0,
                "feasibility": 7.5,
            },
        })
        assert resp.status_code == 403
        assert "not assigned" in resp.json()["detail"].lower()


# ── Test: Score Criteria Validation ──────────────────────────────────────────

class TestScoreCriteriaValidation:
    @patch("app.api.evaluation_routes.decode_access_token")
    def test_missing_criterion_rejected(self, mock_decode, client, db_session):
        """Score submission with missing criterion should return 422."""
        evaluator = make_evaluator(db_session, email=f"miss_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team MissCrit")
        assign_evaluator_to_team(db_session, evaluator, team)

        mock_decode.return_value = {"sub": str(evaluator.id), "role": "evaluator"}

        resp = client.post("/evaluations", params={"token": "mock-token"}, json={
            "team_id": str(team.id),
            "scores": {
                "technical_depth": 8.0,
                # missing innovation, presentation, feasibility
            },
        })
        assert resp.status_code == 422

    @patch("app.api.evaluation_routes.decode_access_token")
    def test_extra_criterion_rejected(self, mock_decode, client, db_session):
        """Score submission with extra unknown criterion should return 422."""
        evaluator = make_evaluator(db_session, email=f"extra_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team ExtraCrit")
        assign_evaluator_to_team(db_session, evaluator, team)

        mock_decode.return_value = {"sub": str(evaluator.id), "role": "evaluator"}

        resp = client.post("/evaluations", params={"token": "mock-token"}, json={
            "team_id": str(team.id),
            "scores": {
                "technical_depth": 8.0,
                "innovation": 7.0,
                "presentation": 6.0,
                "feasibility": 7.5,
                "random_extra": 10.0,
            },
        })
        assert resp.status_code == 422

    @patch("app.api.evaluation_routes.decode_access_token")
    def test_out_of_range_score_rejected(self, mock_decode, client, db_session):
        """Score > 10 should be rejected with 422."""
        evaluator = make_evaluator(db_session, email=f"range_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team OutRange")
        assign_evaluator_to_team(db_session, evaluator, team)

        mock_decode.return_value = {"sub": str(evaluator.id), "role": "evaluator"}

        resp = client.post("/evaluations", params={"token": "mock-token"}, json={
            "team_id": str(team.id),
            "scores": {
                "technical_depth": 11.0,
                "innovation": 7.0,
                "presentation": 6.0,
                "feasibility": 7.5,
            },
        })
        assert resp.status_code == 422

    @patch("app.api.evaluation_routes.decode_access_token")
    def test_valid_full_scores_accepted(self, mock_decode, client, db_session):
        """All 4 valid criteria with valid range should be accepted."""
        evaluator = make_evaluator(db_session, email=f"valid_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team ValidCrit")
        assign_evaluator_to_team(db_session, evaluator, team)

        mock_decode.return_value = {"sub": str(evaluator.id), "role": "evaluator"}

        resp = client.post("/evaluations", params={"token": "mock-token"}, json={
            "team_id": str(team.id),
            "scores": {
                "technical_depth": 8.0,
                "innovation": 7.0,
                "presentation": 6.0,
                "feasibility": 7.5,
            },
        })
        # Should be 200 (accepted) — not 422
        assert resp.status_code in (200, 201)


# ── Test: Project ZIP Upload ─────────────────────────────────────────────────

class TestProjectSubmission:
    @patch("app.api.submission_routes.decode_access_token")
    @patch("app.api.submission_routes.get_token_subject")
    def test_participant_upload_valid_zip(self, mock_subject, mock_decode, client, db_session):
        """Participant with a team should be able to upload a valid .zip file."""
        team = make_approved_team(db_session, name="Team Upload")
        participant = make_participant_in_team(
            db_session, team,
            email=f"uploader_{uuid.uuid4().hex[:8]}@test.com",
        )

        mock_decode.return_value = {"sub": str(participant.id), "role": "participant"}
        mock_subject.return_value = str(participant.id)

        zip_bytes = make_valid_zip_bytes()
        resp = client.post(
            "/submissions/participant/project",
            params={"token": "mock-token"},
            files={"file": ("project.zip", io.BytesIO(zip_bytes), "application/zip")},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    @patch("app.api.submission_routes.decode_access_token")
    @patch("app.api.submission_routes.get_token_subject")
    def test_fake_zip_rejected(self, mock_subject, mock_decode, client, db_session):
        """A text file renamed to .zip should be rejected as not a valid ZIP archive."""
        team = make_approved_team(db_session, name="Team FakeZip")
        participant = make_participant_in_team(
            db_session, team,
            email=f"fake_{uuid.uuid4().hex[:8]}@test.com",
        )

        mock_decode.return_value = {"sub": str(participant.id), "role": "participant"}
        mock_subject.return_value = str(participant.id)

        fake_content = b"This is not a zip file at all, just plain text."
        resp = client.post(
            "/submissions/participant/project",
            params={"token": "mock-token"},
            files={"file": ("project.zip", io.BytesIO(fake_content), "application/zip")},
        )
        assert resp.status_code == 400
        assert "not a valid ZIP archive" in resp.json()["detail"]

    @patch("app.api.submission_routes.decode_access_token")
    @patch("app.api.submission_routes.get_token_subject")
    def test_uppercase_zip_extension_accepted(self, mock_subject, mock_decode, client, db_session):
        """Project.ZIP (uppercase) should be accepted."""
        team = make_approved_team(db_session, name="Team UpperZip")
        participant = make_participant_in_team(
            db_session, team,
            email=f"upper_{uuid.uuid4().hex[:8]}@test.com",
        )

        mock_decode.return_value = {"sub": str(participant.id), "role": "participant"}
        mock_subject.return_value = str(participant.id)

        zip_bytes = make_valid_zip_bytes()
        resp = client.post(
            "/submissions/participant/project",
            params={"token": "mock-token"},
            files={"file": ("Project.ZIP", io.BytesIO(zip_bytes), "application/zip")},
        )
        assert resp.status_code == 200


# ── Test: Submission Route UUID Validation ───────────────────────────────────

class TestSubmissionRouteUUID:
    @patch("app.api.submission_routes.decode_access_token")
    def test_invalid_uuid_returns_422(self, mock_decode, client, db_session):
        """GET /submissions/team/not-a-uuid should return 422."""
        mock_decode.return_value = {"sub": str(uuid.uuid4()), "role": "evaluator"}
        resp = client.get("/submissions/team/not-a-uuid", params={"token": "mock-token"})
        assert resp.status_code == 422


# ── Test: Download Authorization ──────────────────────────────────────────────

class TestDownloadAuthorization:
    def test_download_service_blocks_unassigned(self, db_session):
        """ProjectSubmissionService should raise 403 for unassigned evaluators."""
        from app.services.project_submission_service import ProjectSubmissionService
        from fastapi import HTTPException

        evaluator = make_evaluator(db_session, email=f"dl_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team DL Block")
        # Do NOT assign — should get 403

        with pytest.raises(HTTPException) as exc_info:
            ProjectSubmissionService.get_download_file_for_evaluator(db_session, evaluator, str(team.id))
        assert exc_info.value.status_code == 403
        assert "not assigned" in exc_info.value.detail.lower()

    def test_download_service_allows_assigned(self, db_session):
        """ProjectSubmissionService should allow download for assigned evaluators (404 if no file)."""
        from app.services.project_submission_service import ProjectSubmissionService
        from fastapi import HTTPException

        evaluator = make_evaluator(db_session, email=f"dlok_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team DL Allow")
        assign_evaluator_to_team(db_session, evaluator, team)

        # Should get 404 (no submission), not 403 (not authorized)
        with pytest.raises(HTTPException) as exc_info:
            ProjectSubmissionService.get_download_file_for_evaluator(db_session, evaluator, str(team.id))
        assert exc_info.value.status_code == 404
        assert "no project submission" in exc_info.value.detail.lower()


# ── Test: Demo Reset FK Order ────────────────────────────────────────────────

class TestDemoResetOrder:
    def test_reset_after_submission_no_fk_error(self, db_session):
        """Demo reset should not fail with FK error when submissions exist."""
        from app.services.demo_admin_service import reset_demo_data
        from app.models.project_submission import ProjectSubmission

        team = make_approved_team(db_session, name="Team ResetTest")
        participant = make_participant_in_team(
            db_session, team,
            email=f"resetp_{uuid.uuid4().hex[:8]}@test.com",
        )

        # Create a project submission record (no actual file needed for FK test)
        ps = ProjectSubmission(
            team_id=team.id,
            uploaded_by_participant_id=participant.id,
            original_filename="test.zip",
            stored_filename="test_uuid.zip",
            file_path="/tmp/test_uuid.zip",
            file_size_bytes=1024,
        )
        db_session.add(ps)
        db_session.commit()

        # This should NOT raise IntegrityError
        result = reset_demo_data(db_session)
        assert result["project_submissions"] >= 1
        assert result["participants"] >= 1
        assert result["teams"] >= 1

    def test_reset_clears_all_counts(self, db_session):
        """After reset, all entity counts should be zero."""
        from app.services.demo_admin_service import reset_demo_data, get_demo_status
        from app.models.project_submission import ProjectSubmission

        team = make_approved_team(db_session, name="Team ResetClear")
        participant = make_participant_in_team(
            db_session, team,
            email=f"clearp_{uuid.uuid4().hex[:8]}@test.com",
        )

        ps = ProjectSubmission(
            team_id=team.id,
            uploaded_by_participant_id=participant.id,
            original_filename="test.zip",
            stored_filename="test_uuid.zip",
            file_path="/tmp/test_uuid.zip",
            file_size_bytes=1024,
        )
        db_session.add(ps)
        db_session.commit()

        reset_demo_data(db_session)
        status = get_demo_status(db_session)
        assert status["participants"] == 0
        assert status["teams"] == 0


# ── Test: Score Service Institution Field ────────────────────────────────────

class TestScoreServiceInstitution:
    def test_build_panel_uses_passed_out_institution(self, db_session):
        """_build_panel_entries should read passed_out_institution, not institution."""
        from app.services.score_service import ScoreService
        from app.models.evaluation import Evaluation

        evaluator = make_evaluator(
            db_session,
            email=f"scoreservice_{uuid.uuid4().hex[:8]}@test.com",
            institution="IIT Delhi",
        )
        team = make_approved_team(db_session, name="Team ScoreService")
        make_participant_in_team(
            db_session, team,
            email=f"member_{uuid.uuid4().hex[:8]}@test.com",
        )

        from app.core.security import generate_score_hash
        scores = {"technical_depth": 8.0, "innovation": 7.0, "presentation": 6.0, "feasibility": 7.5}
        ev = Evaluation(
            team_id=team.id,
            evaluator_id=evaluator.id,
            scores=scores,
            score_hash=generate_score_hash(str(evaluator.id), team.id, scores),
        )
        db_session.add(ev)
        db_session.commit()
        db_session.refresh(ev)

        entries = ScoreService._build_panel_entries([ev], db_session)
        assert len(entries) == 1
        # Should contain the normalized institution, not empty string
        assert entries[0]["judge_institution"] == "iit delhi"
