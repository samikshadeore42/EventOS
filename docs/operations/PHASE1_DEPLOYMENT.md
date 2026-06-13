# Stage 2 Phase 1: Organization & Authentication Deployment

This document outlines the deployment and rollback procedures for Stage 2 Phase 1 (Organization and Admin Authentication Foundation) of EventOS.

## Deployment Procedure

### Prerequisites
1. Ensure the PostgreSQL database is backed up.
   ```bash
   docker exec -t EventOS_postgres pg_dumpall -c -U EventOS_user > dump_before_phase1.sql
   ```
2. Ensure you are on the `stage2/org-admin-auth` branch.

### 1. Apply Backend Database Migrations
Run the Alembic migrations to apply the schema changes and trigger the data migration (backfilling legacy admins into the Legacy Organization).
```bash
# Enter the backend environment
source .venv-phase0/bin/activate
cd backend

# Run migrations
alembic upgrade head
```

### 2. Verify Database Migration
Verify that the `users` and `organizations` tables have been populated correctly with legacy admin data.
```bash
docker exec -it EventOS_postgres psql -U EventOS_user -d EventOS_db -c "SELECT email, is_active FROM users;"
docker exec -it EventOS_postgres psql -U EventOS_user -d EventOS_db -c "SELECT name, slug FROM organizations;"
```

### 3. Deploy Application Services
Restart the backend and frontend to apply the new token structure and routing.
```bash
docker compose up -d --build backend
```

### 4. Verification Testing
1. Navigate to the Admin Dashboard login (`/admin/login`). You should be seamlessly redirected to `/auth/login`.
2. Login using the legacy admin credentials (e.g., `misha`).
   - *Note: the frontend automatically handles legacy usernames by appending `@legacy.eventos.invalid`*.
3. Ensure you can access the admin dashboard successfully.
4. Open the frontend regression test suite to ensure no Stage-1 features are broken:
   ```bash
   cd frontend_new
   npm run test
   ```

---

## Rollback Procedure

If a critical failure occurs post-deployment, follow these steps to rollback to the `eventos-stage1-stable-v1` state.

### 1. Revert Codebase
Checkout the stable tag for Stage 1:
```bash
git checkout eventos-stage1-stable-v1
```

### 2. Downgrade Database Schema
Downgrade the Alembic schema to the revision directly preceding Phase 1.
```bash
source .venv-phase0/bin/activate
cd backend
alembic downgrade b8dec86e469e
```
*(Note: Replace `21de10214c77` with the exact revision hash prior to Phase 1's `0940abbefebb`)*

### 3. Restart Application Services
Rebuild and start the Stage 1 containers.
```bash
docker compose up -d --build backend
```

### 4. Verify Rollback
1. Navigate to `/admin/login` and verify the original UI is rendered.
2. Run backend and frontend regression suites to confirm the system has successfully returned to the stable baseline.
