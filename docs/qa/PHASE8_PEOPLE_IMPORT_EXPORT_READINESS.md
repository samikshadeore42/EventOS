# Phase 8: People Import Export Readiness Review

1. **Branch Name**: `phase8/people-import-export`
2. **Latest Commit**: `0204658 - test: cover phase8 people import export`
3. **Migration Status**: No schema migration required. Phase 8 uses the existing `mentors` and `evaluators` tables.
4. **Backend Test Result**: Passed. 11 tests completed in `< 2.0s`. Covered mentor and evaluator import/export logic, duplication handling, event isolation, and capability blocking checks.
5. **Frontend Test Result**: Passed. Vitest regression tests pass without any regression, eslint reports zero errors, and `npm run build` succeeds correctly.
6. **Docker Result**: Containers rebuild cleanly (`docker compose up --build -d`) and start correctly with `uvicorn` and `celery` components healthy.
7. **Manual Mentor Import Workflow**:
   - Go to Admin Dashboard -> Mentors tab.
   - Click "CSV Template" to download `mentors_template.csv`.
   - Fill the file with `first_name,last_name,email,organization,expertise_areas`.
   - Select the CSV file, toggle "Update existing (upsert)" if desired, and click "Import CSV".
   - A summary box appears indicating total rows, created rows, updated rows, and any errors like duplicates.
8. **Manual Evaluator Import Workflow**:
   - Go to Admin Dashboard -> Evaluators / Judges tab.
   - Click "CSV Template" to download `evaluators_template.csv`.
   - Fill the file with `first_name,last_name,email,passed_out_institution,expertise_areas`.
   - Select the CSV file, toggle "Update existing (upsert)" if desired, and click "Import CSV".
   - A summary box appears indicating success, error handling, and creation counts.
9. **Event Isolation Proof**:
   - Database uniqueness constraints strictly scope `uq_mentor_email_event` to `(email, event_id)` and `uq_evaluator_email_event` to `(email, event_id)`.
   - The CSV import backend checks existing participants by running `db.query(...).filter(model_class.event_id == event_id)`.
   - Evaluator/Mentor cross-event leakage is prevented as global uniqueness is not enforced and same email can freely exist across different events.
10. **Known Limitations**:
    - Processing of massive CSVs (> 5MB) is deliberately disabled (HTTP 413) to prevent backend DoS, recommending chunked uploads if exceeding limits.
    - `expertise_areas` are split by commas or semicolons but leading/trailing spaces might exist inside the CSV if not formatted with proper separation.
11. **Final Phase 8 Verdict**: **READY**. The People Operations Layer bulk import/export functionalities are correctly built, heavily tested, scoped by event isolation bounds, and gracefully embedded into the frontend dashboard.
