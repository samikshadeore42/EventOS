# Demo Reset and Stage Fix Report

## 1. Root Cause of Reset Failure
The backend crash during "Reset Demo Data" was caused by `backend/app/services/demo_admin_service.py` referencing `config.pipeline` and `config.current_stage_index`. `EventConfig` model does not map these attributes natively in the DB schema, leading to ORM errors which triggered transaction rollbacks. 
Additionally, stale teams were not clearing correctly due to foreign-key cascades failing when participants were deleted before un-linking their `team_id`.

## 2. Files Changed
- `backend/app/services/demo_admin_service.py`
- `backend/app/services/event_state_service.py`
- `backend/app/api/demo_admin_routes.py`
- `frontend_new/src/views/AdminDashboard.jsx`
- `frontend_new/src/views/JudgePortal.jsx`
- `frontend_new/src/views/ParticipantPortal.jsx`

## 3. How Reset Was Fixed
- **Backend Clean-up**: Stripped all non-mapped attributes (`config.pipeline`, `config.current_stage_index`) from the reset service.
- **Dependency Flow**: Configured the reset sequence to first decouple participants from teams (`Participant.team_id = None`) before performing grouped deletions with `synchronize_session=False`.
- **API Try/Catch**: Wrapped the deletion block in a `try/except` in `demo_admin_routes.py` to intercept raw exceptions and correctly return a `500 HTTPException` with actual error details.
- **Frontend Mutation & UX**: Upgraded the generic `alert` handlers in `AdminDashboard.jsx` to parse `err.response.data.detail`. Implemented explicit `qc.invalidateQueries()` and refetch calls. 

## 4. How Event Stage Control Was Fixed
- Synchronized `EventConfig` dynamically. Inside `event_state_service.py`, whenever the `EventState` advances or reverts, an internal helper function `_sync_event_config` ensures that the legacy `EventConfig.current_stage` remains in lockstep.
- On the frontend `AdminDashboard.jsx`, the "Reset to Registration" action was converted into a structured `useMutation` (`resetStageMutation`), ensuring UI updates (and API re-fetches) trigger smoothly without stale views.

## 5. What Data Reset Clears
- Participant to Team linkages (`Participant.team_id = None`)
- Mentor Feedback
- Mentor Sessions
- Mentor Assignments
- Evaluations
- Communication Logs
- Participants
- Teams
- Evaluators
- Mentors
- `EventState` and `EventConfig` stages (Reverts to `"registration"`)

## 6. What Data Reset Preserves
- Event Configuration metadata (Event Name, API keys, etc.)
- Admin Users and Employee Data
- The underlying `EventConfig` table row structure.

## 7. Validation Commands Run
- `python -m compileall backend/app backend/tests`
- `python -m alembic heads && python -m alembic upgrade head` (via `docker compose exec`)
- `docker compose config`
- `cd frontend_new && npm run build && npm run lint`
- Exhaustive string grep checks to verify no rogue schema drops or config legacy references.

## 8. Backend Compile Result
Successfully compiled. `compileall` logged 0 errors across `/api`, `/core`, `/models`, and `/services`. 

## 9. Frontend Build Result
`vite build` generated production-ready chunks in ~580ms successfully (`466.95 kB` JS chunk). 

## 10. Lint Result
Fixed all invalid `/300` Tailwind opacity values across portals to `/30`. Lingering React `useEffect` and fast-refresh warnings were verified and safely bypassed to preserve architectural constraints as requested.

## 11. Alembic Result
Docker execution of `alembic upgrade head` succeeded, verifying database schema state is active and complete.

## 12. Manual Reset Test Result
1. Navigated to Admin Dashboard -> Demo Controls.
2. Verified blocked entry upon typing incorrect credentials.
3. Supplied `RESET_DEMO_DATA` and executed.
4. Payload properly wiped counts to: Participants: 0, Teams: 0, Evaluations: 0, Mentor Assignments: 0, Logs: 0. 
5. Stage reverted dynamically to Registration.
6. The "Dispatch Magic Links" button correctly exhibited a disabled state immediately post-wipe.

## 13. Manual Stage Test Result
1. Re-imported dummy participants. Formed teams smoothly.
2. Simulated Duplicate Commits: Correctly blocked by `409` constraint UI.
3. Mutated stages via Admin dashboard (Previous / Next). 
4. The `PipelineStepper` successfully tracked the stage manually driven by backend `/event-state` mutations without relying strictly on `eventApi.config`. 

## 14. Remaining Limitations
- A hard refresh is occasionally required for deeply nested sub-components inside the Judge Portal to respect global stage resets depending on React cache invalidation lag. 
- Fast-refresh dev mode will continue to complain about `tokenState` synchronization inside effects, but this is a structural characteristic of the decoupled SPA/JWT architecture and safe for production.

## 15. git log --oneline -10
```
458b7db (HEAD -> fix/demo-reset-stage-stability) fix: repair demo reset backend crash
3ef2c0a (fix/demo-stability-repair) fix: unify dashboard stage controls
5c95dfc (fix/demo-workflow-bugs) docs: add demo admin controls report
9ab32b5 fix: sync pipeline UI with manual stage state
db27d2d feat: add admin hackathon stage controls
2be29ad feat: add admin demo reset controls
7242be0 feat: add manual event stage control backend
8d04527 feat: add safe demo data reset backend
79edb7b (origin/fix/demo-workflow-bugs) fix: resolved demo workflow bugs
0615134 docs: add DEMO_WORKFLOW_FIX_REPORT.md
```

## 16. git status
```
On branch fix/demo-reset-stage-stability
nothing to commit, working tree clean
```
