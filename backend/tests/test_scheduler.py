import pytest
from unittest.mock import patch, MagicMock

from app.core.celery_app import celery_app
from app.tasks.scheduler import (
    consolidate_scores,
    send_daily_evaluation_reminder,
    run_anomaly_sweep,
)

def test_scheduler_task_registration():
    """Verify that all three scheduler tasks are registered in Celery."""
    registered_tasks = celery_app.tasks.keys()
    assert "app.tasks.scheduler.consolidate_scores" in registered_tasks
    assert "app.tasks.scheduler.run_anomaly_sweep" in registered_tasks
    assert "app.tasks.scheduler.send_daily_evaluation_reminder" in registered_tasks

@patch("app.tasks.scheduler.ScoreService.consolidate_all_teams")
@patch("app.tasks.scheduler.SessionLocal")
def test_consolidate_scores_availability(mock_session, mock_consolidate):
    """Test score-consolidation task executes properly."""
    mock_consolidate.return_value = {"teams_processed": 10, "flagged_count": 0, "leaderboard_ready": True}
    result = consolidate_scores()
    assert result["teams_processed"] == 10
    mock_consolidate.assert_called_once()

@patch("app.tasks.scheduler.ScoreService.run_full_panel_anomaly_sweep")
@patch("app.tasks.scheduler.SessionLocal")
def test_run_anomaly_sweep_availability(mock_session, mock_sweep):
    """Test anomaly-sweep task executes properly."""
    mock_sweep.return_value = {"message": "Success"}
    result = run_anomaly_sweep()
    assert result["message"] == "Success"
    mock_sweep.assert_called_once()

@patch("app.tasks.scheduler.SessionLocal")
def test_send_daily_evaluation_reminder_skip_no_approved_teams(mock_session):
    """Test safe skip when no eligible recipients exist (no approved teams)."""
    db_mock = MagicMock()
    mock_session.return_value = db_mock
    
    # query().filter().count() returns 0 for approved teams
    db_mock.query.return_value.filter.return_value.count.side_effect = [0]
    
    result = send_daily_evaluation_reminder()
    assert result.get("skipped") is True
    assert result.get("reason") == "No approved teams"

@patch("app.tasks.scheduler.EmailService.send_email")
@patch("app.tasks.scheduler.SessionLocal")
def test_send_daily_evaluation_reminder_successful_invocation(mock_session, mock_send_email):
    """Test successful reminder email invocation."""
    db_mock = MagicMock()
    mock_session.return_value = db_mock
    
    # 1. approved_count = 5
    # 2. active_evaluators = [evaluator1]
    # 3. submitted_count = 2 (so remaining = 3)
    
    evaluator_mock = MagicMock()
    evaluator_mock.id = "eval1"
    evaluator_mock.email = "eval@example.com"
    evaluator_mock.first_name = "Eval"
    
    db_mock.query.return_value.filter.return_value.count.side_effect = [5, 2]
    db_mock.query.return_value.filter.return_value.all.return_value = [evaluator_mock]
    
    mock_send_email.return_value = {"success": True}
    
    result = send_daily_evaluation_reminder()
    assert result.get("reminders_sent") == 1
    assert result.get("total_evaluators") == 1
    
    mock_send_email.assert_called_once()
    call_args = mock_send_email.call_args[1]
    assert call_args["to_email"] == "eval@example.com"
    assert "Reminder: You have pending evaluations" in call_args["subject"]

@patch("app.tasks.scheduler.EmailService.send_email")
@patch("app.tasks.scheduler.SessionLocal")
def test_send_daily_evaluation_reminder_email_failure_handling(mock_session, mock_send_email):
    """Test email-service failure handling."""
    db_mock = MagicMock()
    mock_session.return_value = db_mock
    
    evaluator_mock = MagicMock()
    evaluator_mock.id = "eval1"
    evaluator_mock.email = "eval@example.com"
    evaluator_mock.first_name = "Eval"
    
    db_mock.query.return_value.filter.return_value.count.side_effect = [5, 2]
    db_mock.query.return_value.filter.return_value.all.return_value = [evaluator_mock]
    
    # Simulate email service failure by returning failure dict instead of exception, 
    # based on how send_email behaves (returns {"success": False, ...}).
    mock_send_email.return_value = {"success": False, "error": "SendGrid Error"}
    
    result = send_daily_evaluation_reminder()
    assert result.get("reminders_sent") == 0
    assert result.get("total_evaluators") == 1
