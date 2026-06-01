# Demo Admin Controls Report

## 1. Why demo reset was needed
The database comes pre-populated with older demo data across participants, teams, evaluations, and mentor operations. Since this data is constrained by unique keys (e.g. participant emails) and statuses, uploading the same demo CSV again results in conflicts or incorrect pipeline logic. A safe reset mechanism allows resetting the pipeline data without dropping the entire database, dropping schema, or losing admin login credentials, facilitating easy and repeatable demonstrations.

## 2. What data reset clears
The reset clears all operational entities in this exact dependency order to avoid foreign key violations:
- `MentorFeedback`
- `MentorSession`
- `MentorAssignment`
- `Evaluation`
- `CommunicationLog`
- `Participant`
- `Team`
- `Evaluator` (judges)
- `Mentor`

## 3. What data reset preserves
The reset explicitly preserves administrative access:
- `Admin` accounts
- `Employee` accounts
- System settings and migrations (`alembic_version`, `event_state`, `event_config`).

## 4. API endpoints added
- `GET /demo-admin/status`: Returns counts for participants, teams, evaluations, mentors, mentor_assignments, and communication_logs.
- `POST /demo-admin/reset`: Accepts `{ confirm: "RESET_DEMO_DATA", preserve_admins: true }` to execute the sequential SQLAlchemy ORM deletions, rolls back on error, and returns counts of deleted records.
- `GET /event-state`: Returns current hackathon stage.
- `POST /event-state/set`: Sets a specific stage.
- `POST /event-state/next`, `POST /event-state/previous`, `POST /event-state/reset`: Steps through or resets the hackathon stage.

## 5. UI controls added
A new **Demo Controls** tab was added in `AdminDashboard.jsx`.
- It visualizes real-time metrics of database row counts across operational tables.
- It includes a **Danger Zone** that enforces typing `RESET_DEMO_DATA` before enabling a visual red warning button to run the reset API. Success prompts a summary alert of deletion counts and invalidates React Query caches for immediate UI refresh.

## 6. Hackathon stage control behavior
- An `EventState` model was added to allow manually overriding the pipeline stage without losing actual pipeline progress.
- The UI exposes a **Stage Controls** block, providing "Previous", "Next", and a dropdown to jump directly to any step (Registration → Team Formation → Evaluation → Results).
- `PipelineStepper.jsx` was modified to fetch and display this manual event state (falling back on normal algorithm logic if absent) allowing seamless pipeline visual tracking.

## 7. Validation commands run
- `docker compose exec backend python -m compileall app`
- `alembic stamp head` & `alembic revision --autogenerate` & `alembic upgrade head`
- `npm run lint` & `npm run build`

## 8. Backend compile result
Backend compilation executed successfully.

## 9. Frontend build result
`vite build` executed successfully without errors.

## 10. Alembic result
Database schemas migrated and upgraded to support the `EventState` table properly.

## 11. Manual test results
- Tested resetting operational data with wrong confirmation strings (blocked).
- Validated `RESET_DEMO_DATA` confirmation string deletes data and resets counts to zero, leaving Admins intact.
- Confirmed hackathon pipeline stepper properly respects manual backward and forward stage triggers.

## 12. Safety limitations
The demo reset API route uses raw POST handling that should be secured using JWT `admin=Depends(get_current_admin)` if deployed to production. This is for local/demo/admin use only.
