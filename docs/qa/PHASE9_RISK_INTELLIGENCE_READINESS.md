# Phase 9: AI Risk Intelligence Layer Readiness

## Scope Verification
1. **Risk Models**: Implemented `RiskSignal` and `TeamRiskSnapshot` in `models/risk.py` with full SQLAlchemy 2.0 native `Mapped` syntax.
2. **Celery Beat Processing**: Added `process_risk_sweeps` in `app/tasks/risk.py` that schedules automated sweeps every 30 minutes. Tested logic successfully filters for active events with `risk_monitoring` capabilities.
3. **API & Access Controls**: Created `risk_routes.py` with `RequireOrganizationRole` to enforce standard organization owner/admin isolation. Verified 403 blocks access correctly when `risk_monitoring` is disabled.
4. **Risk Heuristics**: Added deterministic rules covering missing submissions, lack of mentor, stale interaction, open blockers, and low participant count.
5. **Frontend Dashboard**: Admin Dashboard includes dynamic Risk Tab mapping team risk summaries with color-coded alerts and manual re-sweep controls.
6. **Isolation**: Confirmed through testing that risk snapshots and history are strictly event-scoped and organization-isolated.

## Test Coverage
- `test_risk_endpoints_require_capability`: Verified.
- `test_risk_summary_returns_empty_before_sweep`: Verified.
- `test_sweep_creates_snapshot_per_team`: Verified.
- `test_high_risk_team`: Verified correctly applies heuristic logic.
- `test_low_risk_team`: Verified.
- `test_celery_risk_task_processes_only_active_events_with_capability`: Verified.
- `test_team_history_is_event_scoped`: Verified isolation.

## Security & Architecture Audit
- **Data Leakage**: Organization role checking fully enforced at router level.
- **SQLite vs Postgres**: Resolved SQLite implicitly coercing numeric UUID hex strings into IEEE float numbers by updating the test UUID variables to have alpha chars in the first sequence.
- **Mixins vs Mapped**: Removed mixing of `Column()` and `Mapped[]` to prevent mapping corruption on SQLite `RETURNING` clauses.
- **Timestamps**: Addressed timezone unawareness errors by converting Python `datetime` instances to UTC format before doing comparisons with SQLite results.

## Readiness Decision
Phase 9 Risk Intelligence is **READY** for integration and staging deployment. Tests pass, components are fully integrated, and UI controls function as designed.
