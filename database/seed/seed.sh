#!/usr/bin/env bash
set -euo pipefail

SEED_SQL_PATH="${SEED_SQL_PATH:-/seed/backup.sql}"
MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:?MYSQL_USER is required}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
MYSQL_DATABASE="${MYSQL_DATABASE:?MYSQL_DATABASE is required}"
MYSQL_SSL_MODE="${MYSQL_SSL_MODE:-}"
MYSQL_SSL_CA="${MYSQL_SSL_CA:-}"

MYSQL_BASE_ARGS=(
  "-h${MYSQL_HOST}"
  "-P${MYSQL_PORT}"
  "-u${MYSQL_USER}"
  "-p${MYSQL_PASSWORD}"
)

if [[ -n "${MYSQL_SSL_MODE}" ]]; then
  MYSQL_BASE_ARGS+=("--ssl-mode=${MYSQL_SSL_MODE}")
fi

if [[ -n "${MYSQL_SSL_CA}" ]]; then
  MYSQL_BASE_ARGS+=("--ssl-ca=${MYSQL_SSL_CA}")
fi

echo "[db-seed] Waiting for MySQL at ${MYSQL_HOST}:${MYSQL_PORT}..."
until mysqladmin ping "${MYSQL_BASE_ARGS[@]}" --silent; do
  sleep 2
done

USER_COUNT="$(
  mysql "${MYSQL_BASE_ARGS[@]}" -N -e \
    "SELECT COUNT(*) FROM \`${MYSQL_DATABASE}\`.users;" 2>/dev/null || echo "0"
)"

if [[ "${USER_COUNT}" != "0" && "${USER_COUNT}" != "" ]]; then
  echo "[db-seed] Skip seed: users already exist (${USER_COUNT})."
  exit 0
fi

if [[ ! -f "${SEED_SQL_PATH}" ]]; then
  echo "[db-seed] Seed file not found: ${SEED_SQL_PATH}" >&2
  exit 1
fi

echo "[db-seed] Loading ${SEED_SQL_PATH} into ${MYSQL_DATABASE}..."
mysql "${MYSQL_BASE_ARGS[@]}" "${MYSQL_DATABASE}" < "${SEED_SQL_PATH}"

# The source dump uses 2026-08-10 as its timeline anchor. Shift operational
# dates by the same number of days so a newly seeded demo always feels current.
echo "[db-seed] Aligning project, task, and logwork dates with today..."
mysql "${MYSQL_BASE_ARGS[@]}" "${MYSQL_DATABASE}" <<'SQL'
SET @seed_anchor_date = DATE('2026-08-10');
SET @seed_date_offset = DATEDIFF(CURDATE(), @seed_anchor_date);

UPDATE projects
SET start_date = DATE_ADD(start_date, INTERVAL @seed_date_offset DAY),
    end_date = DATE_ADD(end_date, INTERVAL @seed_date_offset DAY),
    created_at = DATE_ADD(created_at, INTERVAL @seed_date_offset DAY),
    updated_at = DATE_ADD(updated_at, INTERVAL @seed_date_offset DAY);

UPDATE project_members
SET joined_at = DATE_ADD(joined_at, INTERVAL @seed_date_offset DAY);

UPDATE sprints
SET start_date = DATE_ADD(start_date, INTERVAL @seed_date_offset DAY),
    end_date = DATE_ADD(end_date, INTERVAL @seed_date_offset DAY),
    created_at = DATE_ADD(created_at, INTERVAL @seed_date_offset DAY),
    updated_at = DATE_ADD(updated_at, INTERVAL @seed_date_offset DAY);

UPDATE tasks
SET start_date = DATE_ADD(start_date, INTERVAL @seed_date_offset DAY),
    deadline = DATE_ADD(deadline, INTERVAL @seed_date_offset DAY),
    completed_at = DATE_ADD(completed_at, INTERVAL @seed_date_offset DAY),
    created_at = DATE_ADD(created_at, INTERVAL @seed_date_offset DAY),
    updated_at = DATE_ADD(updated_at, INTERVAL @seed_date_offset DAY);

UPDATE task_assignees
SET assigned_at = DATE_ADD(assigned_at, INTERVAL @seed_date_offset DAY);

UPDATE logworks
SET work_date = DATE_ADD(work_date, INTERVAL @seed_date_offset DAY),
    created_at = DATE_ADD(created_at, INTERVAL @seed_date_offset DAY),
    updated_at = DATE_ADD(updated_at, INTERVAL @seed_date_offset DAY);
SQL
echo "[db-seed] Seed complete."
