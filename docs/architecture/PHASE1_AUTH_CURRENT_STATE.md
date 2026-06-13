# PHASE 1: Current Auth State

## Current Models
- **Admin**: Fields are `id` (UUID), `username`, `employee_id` (FK to Employee), `hashed_password`, `created_at`.
- **Employee**: Fields are `employee_id`, `name`, `created_at`.

## Current Endpoints
- `POST /admin/login`: Accepts `username` and `password`. Returns `{ "access_token": token, "token_type": "bearer" }`.
- `POST /admin/signup`: Accepts `username`, `password`, `confirm_password`, `employee_id`.

## Security Implementations
- **Password Hashing**: Uses `bcrypt` (via `get_password_hash` and `verify_password` in `app.core.security`).
- **JWT Generation**: `create_access_token` generates tokens with `sub`, `role` (`TokenRole.ADMIN`), `stage`, `iat`, `exp` claims.
- **Token Expiry**: Default is 7 days.
- **Frontend Storage**: JWT is stored in `sessionStorage` under `eventos_token`. Managed in `frontend_new/src/services/api.js`.
- **Route Protection**: The backend currently exposes admin operations largely without widespread `Depends(require_admin)` usage, or relies on frontend hiding logic.

## Deficiencies & Compatibility Risks
- Hardcoded `TokenRole.ADMIN` inside the token, not looking up the DB dynamically.
- `sessionStorage` doesn't persist across tabs and leaves long-lived tokens in browser memory.
- Lack of refresh token functionality.
- No organization scoping mechanism.
- No locking mechanism for failed login attempts.
- No password reset logic.

## Exact Migration Strategy
- Additive schema update: create `organizations`, `users`, `organization_memberships`, `user_sessions`, `admin_invitations`, `email_verification_tokens`, `password_reset_tokens`, and `audit_logs` tables.
- Legacy adaptation: Backfill existing `admins` to `users` and assign them to a default `EventOS Legacy Organization`.
- Maintain `POST /admin/login` temporarily while the new `/auth/login` takes over, so the current `Stage-1` UI remains unbroken.
