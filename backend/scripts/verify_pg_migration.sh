#!/usr/bin/env bash
set -euo pipefail
echo "=== 1. Alembic heads ===" && docker compose exec backend alembic heads
echo "=== 2. Current tables ===" && docker compose exec postgres psql -U EventOS_user -d EventOS_db -c "\dt"
echo "=== 3. Current revision ===" && docker compose exec backend alembic current
echo "=== 4. Users ===" && docker compose exec postgres psql -U EventOS_user -d EventOS_db -c "SELECT id, email, email_verified FROM users LIMIT 5;"
echo "=== 5. Organizations ===" && docker compose exec postgres psql -U EventOS_user -d EventOS_db -c "SELECT id, name, slug FROM organizations;"
echo "=== 6. Memberships ===" && docker compose exec postgres psql -U EventOS_user -d EventOS_db -c "SELECT organization_id, user_id, role, status FROM organization_memberships;"
echo "=== DONE ==="
