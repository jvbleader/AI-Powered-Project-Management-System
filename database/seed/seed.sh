#!/usr/bin/env bash
set -euo pipefail

SEED_SQL_PATH="${SEED_SQL_PATH:-/seed/backup.sql}"
MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:?MYSQL_USER is required}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
MYSQL_DATABASE="${MYSQL_DATABASE:?MYSQL_DATABASE is required}"

echo "[db-seed] Waiting for MySQL at ${MYSQL_HOST}:${MYSQL_PORT}..."
until mysqladmin ping -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" --silent; do
  sleep 2
done

USER_COUNT="$(
  mysql -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -N -e \
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
mysql -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" < "${SEED_SQL_PATH}"
echo "[db-seed] Seed complete."
