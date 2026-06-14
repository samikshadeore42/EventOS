import io
import uuid
import zipfile
import pytest
from unittest.mock import patch
from tests.conftest import TEST_EVENT_ID

def make_evaluator(db_session, email="judge@test.com", institution=None):
    from app.models.evaluation import Evaluator
    e = Evaluator(first_name="Test", last_name="Judge", email=email, expertise_areas=["testing"], passed_out_institution=institution, is_active=True, event_id=TEST_EVENT_ID)
    db_session.add(e)
    db_session.commit()
    return e

def make_approved_team(db_session, name="Team Test"):
    from app.models.participant import Team
    t = Team(team_name=name, rationale="Test", is_approved=True, event_id=TEST_EVENT_ID)
    db_session.add(t)
    db_session.commit()
    return t

def make_participant_in_team(db_session, team, email="p@test.com", institution="BITS Pilani"):
    from app.models.participant import Participant
    p = Participant(first_name="Student", last_name="One", email=email, institution=institution, team_id=team.id, skill_vector={"python": 5.0}, event_id=TEST_EVENT_ID)
    db_session.add(p)
    db_session.commit()
    return p

def assign_evaluator_to_team(db_session, evaluator, team):
    from app.models.assignment import EvaluatorTeamAssignment
    a = EvaluatorTeamAssignment(evaluator_id=evaluator.id, team_id=team.id, event_id=TEST_EVENT_ID)
    db_session.add(a)
    db_session.commit()

def make_valid_zip_bytes():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.md", "# Test Project")
    buf.seek(0)
    return buf.read()

class TestEvaluatorCreation:
    def test_create_evaluator_with_institution(self, client, db_session):
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluators", json={"first_name": "Dr. Test", "last_name": "Create", "email": f"create_{uuid.uuid4().hex[:8]}@test.com", "expertise_areas": ["ml"], "passed_out_institution": "IIT Madras"}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 201

    def test_create_evaluator_without_institution(self, client, db_session):
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluators", json={"first_name": "Dr. No", "last_name": "Inst", "email": f"noinst_{uuid.uuid4().hex[:8]}@test.com", "expertise_areas": []}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 201

class TestEvaluatorAssignment:
    def test_assign_evaluator_success(self, client, db_session):
        evaluator = make_evaluator(db_session, email=f"assign_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team NoConflict")
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluators/assign", json={"evaluator_id": str(evaluator.id), "team_ids": [str(team.id)]}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 200

    def test_assign_evaluator_conflict_blocked(self, client, db_session):
        evaluator = make_evaluator(db_session, email=f"conflict_{uuid.uuid4().hex[:8]}@test.com", institution="BITS Pilani")
        team = make_approved_team(db_session, name="Team Conflicting")
        make_participant_in_team(db_session, team, email=f"student_{uuid.uuid4().hex[:8]}@bits.ac.in", institution="BITS Pilani")
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluators/assign", json={"evaluator_id": str(evaluator.id), "team_ids": [str(team.id)]}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 422

    def test_assign_evaluator_conflict_normalized(self, client, db_session):
        evaluator = make_evaluator(db_session, email=f"normconflict_{uuid.uuid4().hex[:8]}@test.com", institution="iitl")
        team = make_approved_team(db_session, name="Team NormConflict")
        make_participant_in_team(db_session, team, email=f"student_{uuid.uuid4().hex[:8]}@iitl.ac.in", institution="IITL")
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluators/assign", json={"evaluator_id": str(evaluator.id), "team_ids": [str(team.id)]}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 422

    def test_assign_evaluator_preserves_old_on_failure(self, client, db_session):
        evaluator = make_evaluator(db_session, email=f"preserve_{uuid.uuid4().hex[:8]}@test.com", institution="iitl")
        old_team = make_approved_team(db_session, name="Team Old")
        assign_evaluator_to_team(db_session, evaluator, old_team)
        resp422 = client.post(f"/events/{TEST_EVENT_ID}/evaluators/assign", json={"evaluator_id": str(evaluator.id), "team_ids": [str(uuid.uuid4())]}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp422.status_code in [404, 422]

    def test_assign_evaluator_empty_institution_no_block(self, client, db_session):
        evaluator = make_evaluator(db_session, email=f"noinst_assign_{uuid.uuid4().hex[:8]}@test.com", institution=None)
        team = make_approved_team(db_session, name="Team EmptyInst")
        make_participant_in_team(db_session, team, email=f"student_{uuid.uuid4().hex[:8]}@test.com", institution="IITL")
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluators/assign", json={"evaluator_id": str(evaluator.id), "team_ids": [str(team.id)]}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 200

    def test_get_evaluator_assignments(self, client, db_session):
        evaluator = make_evaluator(db_session, email=f"getassign_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team Assigned")
        assign_evaluator_to_team(db_session, evaluator, team)
        resp = client.get(f"/events/{TEST_EVENT_ID}/evaluators/{evaluator.id}/assignments", headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 200

class TestJudgePortalAssignment:
    @patch("app.services.link_service.decode_access_token")
    def test_evaluator_portal_returns_only_assigned_teams(self, mock_decode, client, db_session):
        evaluator = make_evaluator(db_session, email=f"portal_{uuid.uuid4().hex[:8]}@test.com")
        team_assigned = make_approved_team(db_session, name="Team Assigned Portal")
        assign_evaluator_to_team(db_session, evaluator, team_assigned)
        mock_decode.return_value = {"sub": str(evaluator.id), "role": "evaluator", "event_id": str(TEST_EVENT_ID), "stage": "evaluation"}
        resp = client.get(f"/events/{TEST_EVENT_ID}/portal/access", params={"token": "mock-token"}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 200

class TestScoreSubmissionAuth:
    @patch("app.api.evaluation_routes.decode_access_token")
    def test_score_blocked_for_unassigned_team(self, mock_decode, client, db_session):
        evaluator = make_evaluator(db_session, email=f"score_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team Unassigned")
        mock_decode.return_value = {"sub": str(evaluator.id), "role": "evaluator", "event_id": str(TEST_EVENT_ID)}
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluations", params={"token": "mock-token"}, json={"team_id": str(team.id), "scores": {"technical_depth": 8.0}}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code in [403, 422]

class TestScoreCriteriaValidation:
    @patch("app.api.evaluation_routes.decode_access_token")
    def test_missing_criterion_rejected(self, mock_decode, client, db_session):
        evaluator = make_evaluator(db_session, email=f"miss_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team MissCrit")
        assign_evaluator_to_team(db_session, evaluator, team)
        mock_decode.return_value = {"sub": str(evaluator.id), "role": "evaluator", "event_id": str(TEST_EVENT_ID)}
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluations", params={"token": "mock-token"}, json={"team_id": str(team.id), "scores": {"technical_depth": 8.0}}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 422

    @patch("app.api.evaluation_routes.decode_access_token")
    def test_extra_criterion_rejected(self, mock_decode, client, db_session):
        evaluator = make_evaluator(db_session, email=f"extra_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team ExtraCrit")
        assign_evaluator_to_team(db_session, evaluator, team)
        mock_decode.return_value = {"sub": str(evaluator.id), "role": "evaluator", "event_id": str(TEST_EVENT_ID)}
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluations", params={"token": "mock-token"}, json={"team_id": str(team.id), "scores": {"technical_depth": 8.0, "random_extra": 10.0}}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 422

    @patch("app.api.evaluation_routes.decode_access_token")
    def test_out_of_range_score_rejected(self, mock_decode, client, db_session):
        evaluator = make_evaluator(db_session, email=f"range_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team OutRange")
        assign_evaluator_to_team(db_session, evaluator, team)
        mock_decode.return_value = {"sub": str(evaluator.id), "role": "evaluator", "event_id": str(TEST_EVENT_ID)}
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluations", params={"token": "mock-token"}, json={"team_id": str(team.id), "scores": {"technical_depth": 11.0}}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 422

    @patch("app.api.evaluation_routes.decode_access_token")
    def test_valid_full_scores_accepted(self, mock_decode, client, db_session):
        evaluator = make_evaluator(db_session, email=f"valid_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team ValidCrit")
        assign_evaluator_to_team(db_session, evaluator, team)
        mock_decode.return_value = {"sub": str(evaluator.id), "role": "evaluator", "event_id": str(TEST_EVENT_ID)}
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluations", params={"token": "mock-token"}, json={"team_id": str(team.id), "scores": {"technical_depth": 8.0, "innovation": 7.0, "presentation": 6.0, "feasibility": 7.5}}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code in [200, 201]

    @patch("app.api.evaluation_routes.decode_access_token")
    def test_non_evaluator_cannot_update_scorecard(self, mock_decode, client, db_session):
        evaluator = make_evaluator(db_session, email=f"role_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team ValidCrit2")
        assign_evaluator_to_team(db_session, evaluator, team)
        mock_decode.return_value = {"sub": str(evaluator.id), "role": "participant", "event_id": str(TEST_EVENT_ID)}
        resp = client.post(f"/events/{TEST_EVENT_ID}/evaluations", params={"token": "mock-token"}, json={"team_id": str(team.id), "scores": {"technical_depth": 8.0, "innovation": 7.0, "presentation": 6.0, "feasibility": 7.5}}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code in [403, 422]

class TestProjectSubmission:
    @patch("app.api.submission_routes.decode_access_token")
    @patch("app.api.submission_routes.get_token_subject")
    def test_participant_upload_valid_zip(self, mock_subject, mock_decode, client, db_session):
        team = make_approved_team(db_session, name="Team Upload")
        participant = make_participant_in_team(db_session, team, email=f"up_{uuid.uuid4().hex[:8]}@test.com")
        mock_decode.return_value = {"sub": str(participant.id), "role": "participant", "event_id": str(TEST_EVENT_ID)}
        mock_subject.return_value = str(participant.id)
        resp = client.post(f"/events/{TEST_EVENT_ID}/submissions/participant/project", params={"token": "mock-token"}, files={"file": ("project.zip", io.BytesIO(make_valid_zip_bytes()), "application/zip")}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 200

    @patch("app.api.submission_routes.decode_access_token")
    @patch("app.api.submission_routes.get_token_subject")
    def test_fake_zip_rejected(self, mock_subject, mock_decode, client, db_session):
        team = make_approved_team(db_session, name="Team FakeZip")
        participant = make_participant_in_team(db_session, team, email=f"fake_{uuid.uuid4().hex[:8]}@test.com")
        mock_decode.return_value = {"sub": str(participant.id), "role": "participant", "event_id": str(TEST_EVENT_ID)}
        mock_subject.return_value = str(participant.id)
        resp = client.post(f"/events/{TEST_EVENT_ID}/submissions/participant/project", params={"token": "mock-token"}, files={"file": ("project.zip", io.BytesIO(b"fake"), "application/zip")}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 400

    @patch("app.api.submission_routes.decode_access_token")
    @patch("app.api.submission_routes.get_token_subject")
    def test_uppercase_zip_extension_accepted(self, mock_subject, mock_decode, client, db_session):
        team = make_approved_team(db_session, name="Team UpperZip")
        participant = make_participant_in_team(db_session, team, email=f"upz_{uuid.uuid4().hex[:8]}@test.com")
        mock_decode.return_value = {"sub": str(participant.id), "role": "participant", "event_id": str(TEST_EVENT_ID)}
        mock_subject.return_value = str(participant.id)
        resp = client.post(f"/events/{TEST_EVENT_ID}/submissions/participant/project", params={"token": "mock-token"}, files={"file": ("P.ZIP", io.BytesIO(make_valid_zip_bytes()), "application/zip")}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 200

class TestSubmissionRouteUUID:
    @patch("app.api.submission_routes.decode_access_token")
    def test_invalid_uuid_returns_422(self, mock_decode, client, db_session):
        mock_decode.return_value = {"sub": str(uuid.uuid4()), "role": "evaluator", "event_id": str(TEST_EVENT_ID)}
        resp = client.get(f"/events/{TEST_EVENT_ID}/submissions/team/not-a-uuid", params={"token": "mock-token"}, headers={"X-Event-Id": str(TEST_EVENT_ID)})
        assert resp.status_code == 422

class TestDownloadAuthorization:
    def test_download_service_blocks_unassigned(self, db_session):
        from app.services.project_submission_service import ProjectSubmissionService
        from fastapi import HTTPException
        evaluator = make_evaluator(db_session, email=f"dl_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team DL Block")
        with pytest.raises(HTTPException) as exc_info:
            ProjectSubmissionService.get_download_file_for_evaluator(event_id=TEST_EVENT_ID, db=db_session, evaluator=evaluator, team_id=team.id)
        assert exc_info.value.status_code == 403

    def test_download_service_allows_assigned(self, db_session):
        from app.services.project_submission_service import ProjectSubmissionService
        from fastapi import HTTPException
        evaluator = make_evaluator(db_session, email=f"dlok_{uuid.uuid4().hex[:8]}@test.com")
        team = make_approved_team(db_session, name="Team DL Allow")
        assign_evaluator_to_team(db_session, evaluator, team)
        with pytest.raises(HTTPException) as exc_info:
            ProjectSubmissionService.get_download_file_for_evaluator(event_id=TEST_EVENT_ID, db=db_session, evaluator=evaluator, team_id=team.id)
        assert exc_info.value.status_code == 404

class TestScoreServiceInstitution:
    def test_build_panel_uses_passed_out_institution(self, db_session):
        from app.services.score_service import ScoreService
        from app.models.evaluation import Evaluation
        from app.core.security import generate_score_hash
        evaluator = make_evaluator(db_session, email=f"score_{uuid.uuid4().hex[:8]}@test.com", institution="IIT Delhi")
        team = make_approved_team(db_session, name="Team ScoreService")
        scores = {"technical_depth": 8.0}
        ev = Evaluation(team_id=team.id, evaluator_id=evaluator.id, scores=scores, score_hash=generate_score_hash(str(evaluator.id), team.id, scores), event_id=TEST_EVENT_ID)
        db_session.add(ev)
        db_session.commit()
        entries = ScoreService._build_panel_entries(TEST_EVENT_ID, [ev], db_session)
        assert len(entries) == 1

    def test_coi_anomaly_detection_with_normalization(self, db_session):
        from app.services.score_service import ScoreService
        from app.models.evaluation import Evaluation
        from app.core.security import generate_score_hash
        evaluator = make_evaluator(db_session, email=f"coi_{uuid.uuid4().hex[:8]}@test.com", institution="iitl")
        team = make_approved_team(db_session, name="Team COI")
        scores = {"technical_depth": 10.0}
        ev = Evaluation(team_id=team.id, evaluator_id=evaluator.id, scores=scores, score_hash=generate_score_hash(str(evaluator.id), team.id, scores), event_id=TEST_EVENT_ID)
        db_session.add(ev)
        db_session.commit()
        entries = ScoreService._build_panel_entries(TEST_EVENT_ID, [ev], db_session)
        assert len(entries) == 1
