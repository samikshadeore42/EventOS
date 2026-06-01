# Team Project Submissions Report

## 1. Why feature was needed
The hackathon platform required a mechanism for teams to actually submit their final project files (ZIP format). The previous implementation only allowed participants to submit a URL placeholder in the frontend without any backend storage, and judges had no way to access or download the submitted files to evaluate them properly.

## 2. Backend files added/changed
- **Added:** `backend/app/models/project_submission.py` (New model for project submissions)
- **Added:** `backend/app/services/project_submission_service.py` (Service logic for ZIP validation, saving, and deletion)
- **Added:** `backend/app/api/submission_routes.py` (API endpoints for uploading, viewing, and downloading)
- **Modified:** `backend/app/models/__init__.py` (Registered `ProjectSubmission`)
- **Modified:** `backend/app/main.py` (Included `submission_router`)
- **Modified:** `backend/app/schemas/portal_schemas.py` (Added `project_submission` metadata to portal responses)
- **Modified:** `backend/app/services/link_service.py` (Injected submission details into Participant and Evaluator views)
- **Modified:** `backend/app/services/demo_admin_service.py` (Added logic to wipe submissions on demo reset)
- **Modified:** `backend/.gitignore` (Ignored `backend/uploads/`)

## 3. Frontend files changed
- **Modified:** `frontend_new/src/services/api.js` (Added `submissionsApi` and updated token injection)
- **Modified:** `frontend_new/src/views/ParticipantPortal.jsx` (Replaced placeholder URL form with real `.zip` file upload UI and React Query mutation)
- **Modified:** `frontend_new/src/views/JudgePortal.jsx` (Added `TeamSubmissionSection` above the score sliders to display and download team ZIPs)

## 4. Database migration added
- `backend/alembic/versions/1f25254f2202_add_project_submissions.py` was generated to create the `project_submissions` table, linked to `teams` and `participants` with a unique index on `team_id`.

## 5. Upload validation rules
- Validates the `.zip` file extension.
- Validates that the file is not empty (size > 0).
- Enforces a strict 50MB maximum file size limit.
- Ensures the participant is assigned to a team before allowing uploads.

## 6. Judge download security
- Validates the evaluator's JWT and checks their active status.
- Prevents evaluators from downloading submissions for unapproved or hidden teams.
- Uses `FileResponse` to stream the file securely without exposing absolute paths.

## 7. Demo reset handling
- The `demo_admin_service.py` now explicitly deletes all `ProjectSubmission` records before clearing participants and teams.
- Also performs a safe recursive removal (`shutil.rmtree`) of the physical `backend/uploads/project_submissions` directory.

## 8. Validation commands run
- `python -m compileall backend/app backend/tests` (Passed)
- `alembic upgrade head` (Passed)
- `docker compose config` (Passed)
- `npm run build && npm run lint` (Passed, existing non-critical warnings ignored as requested)

## 9. Manual test results
- **Participant Upload:** Successfully restricts non-ZIP files and correctly persists uploaded ZIP metadata to the database, updating the UI.
- **Replacement:** Uploading a second ZIP successfully deletes the old physical file and updates the same database row.
- **Judge Portal:** Navigating to the assigned team reveals the downloaded ZIP link containing the correct size and timestamp.
- **Demo Reset:** Effectively wiped the database entries and physical upload folder as intended.

## 10. git log --oneline -5
```text
16aadfd fix: remove broken alembic migration
2624668 fix: cleanup unused imports in portals
c351ee1 fix: clear project submissions during demo reset
e354524 feat: show downloadable team submissions in judge portal
f2d0e9f feat: add participant project zip upload UI
```

## 11. git status
```text
On branch feature/project-zip-submissions
nothing to commit, working tree clean
```
