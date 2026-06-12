# EventOS Stage 1 Rollback Procedure

## Rollback execution record

| Field                    | Value |
| ------------------------ | ----- |
| Rollback decision owner  |       |
| Backup selected          |       |
| Rollback start time      |       |
| Rollback completion time |       |
| Health-check result      |       |
| Data verification result |       |

## 1. Code rollback

The stable Stage-1 tag will be:

```bash
eventos-stage1-stable-v1
```

After the tag has been created and pushed, rollback code can be checked out using:

```bash
git fetch --tags
git checkout eventos-stage1-stable-v1
```

Do not execute this procedure before the tag exists.

For an operational rollback branch:

```bash
git checkout -b rollback/stage1 eventos-stage1-stable-v1
```

Never force-push protected `main`.

## 2. Database restore

Never test or perform a destructive restore against the active database without an approved maintenance window.

The final locally verified Stage-1 backup was:

```text
Local validation path:
backups/eventos_stage1_20260612_231928.dump

SHA-256:
73bc4a16e67f7985db6e0dc252c65c7e8a9d5790c15c02a9eac97f2b39bfedf0
```

Production backups must be stored securely outside the Git repository.

Before restoration:

```bash
export BACKUP_FILE="/secure/off-repository/backups/eventos_stage1_verified.dump"
export TEMP_RESTORE_DB="eventos_stage1_restore_validation"

test -f "$BACKUP_FILE"
sha256sum "$BACKUP_FILE"
```

Create a controlled temporary database:

```bash
docker compose exec -T postgres sh -lc \
  'dropdb -U "$POSTGRES_USER" --if-exists "$1" &&
   createdb -U "$POSTGRES_USER" "$1"' \
  sh "$TEMP_RESTORE_DB"
```

Restore a PostgreSQL custom-format backup:

```bash
docker compose exec -T postgres sh -lc \
  'pg_restore \
     -U "$POSTGRES_USER" \
     -d "$1" \
     --no-owner \
     --no-privileges \
     --exit-on-error' \
  sh "$TEMP_RESTORE_DB" < "$BACKUP_FILE"
```

Verify the restored schema:

```bash
docker compose exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$1" \
   -c "SELECT version_num FROM alembic_version;"' \
  sh "$TEMP_RESTORE_DB"
```

Expected verified Stage-1 revision:

```text
b8dec86e469e
```

Verify critical data:

```bash
docker compose exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$1" \
   -c "SELECT COUNT(*) FROM participants;
       SELECT COUNT(*) FROM teams;
       SELECT COUNT(*) FROM communication_logs;
       SELECT COUNT(*) FROM evaluations;"' \
  sh "$TEMP_RESTORE_DB"
```

The verified backup restored:

```text
participants: 5
teams: 4
communication_logs: 11
evaluations: 0
```

Verify `communication_logs` contains `idempotency_key` and its unique index:

```bash
docker compose exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$1" \
   -c "\d communication_logs"' \
  sh "$TEMP_RESTORE_DB"
```

After verification, remove only the temporary database:

```bash
docker compose exec -T postgres sh -lc \
  'dropdb -U "$POSTGRES_USER" --if-exists "$1"' \
  sh "$TEMP_RESTORE_DB"
```

A production restoration must use the same verified procedure during an approved maintenance window.

## 3. Upload restoration

The locally validated upload archive was:

```text
backups/eventos_uploads_20260612_184409.tar.gz
```

Production upload archives must remain securely outside Git.

Verify an archive before restoration:

```bash
export UPLOAD_ARCHIVE="/secure/off-repository/backups/eventos_uploads_verified.tar.gz"

test -f "$UPLOAD_ARCHIVE"
sha256sum "$UPLOAD_ARCHIVE"
tar -tzf "$UPLOAD_ARCHIVE" >/dev/null
```

Test extraction without touching active uploads:

```bash
UPLOAD_TEST_DIR="$(mktemp -d)"

tar -xzf "$UPLOAD_ARCHIVE" -C "$UPLOAD_TEST_DIR"
find "$UPLOAD_TEST_DIR" -maxdepth 4 -print

rm -rf "$UPLOAD_TEST_DIR"
```

During an approved rollback, first preserve the current upload directory:

```bash
mv backend/uploads backend/uploads.pre-rollback
mkdir -p backend/uploads
```

Extract the verified archive:

```bash
tar -xzf "$UPLOAD_ARCHIVE" -C backend/uploads
```

Confirm ownership, permissions and expected files after extraction.

Never commit upload archives or runtime upload data.

## Service restart verification

After code, database and upload restoration:

```bash
docker compose up --build -d
docker compose ps
docker compose exec backend alembic current
curl -i http://localhost:8000/health
```

Verify Celery:

```bash
docker compose exec celery_worker \
  celery -A app.core.celery_app inspect ping

docker compose exec celery_worker \
  celery -A app.core.celery_app inspect registered
```

Rollback is complete only when:

* the approved stable code is running;
* the selected database backup is restored;
* upload restoration is verified;
* Alembic reports the expected revision;
* `/health` returns HTTP 200;
* Celery worker responds;
* required tasks are registered;
* critical data has been manually verified;
* the rollback decision owner records the final result.
