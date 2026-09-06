"""One-shot Alembic migration for Docker Compose db-migrate service.

The early revision chain (b47dbc775d94 …) assumes an existing core schema and
breaks on an empty database (FK to projects/users before those tables exist).

Fresh DB strategy (same idea as production one-click templates):
  1. Stamp the revision immediately before the destructive schema reset
  2. Run `alembic upgrade head` so 8c4a5f9f3c2d+ build the full schema

Existing DB:
  - Just `alembic upgrade head`
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

# Ensure /app wins over any site-packages stub package.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings  # noqa: E402

# Parent of 8c4a5f9f3c2d (full schema reset).
PRE_RESET_REVISION = "c53a6b09f71b"


def _run_alembic(*args: str) -> None:
    subprocess.run(["alembic", *args], cwd=BACKEND_ROOT, check=True)


def _is_fresh_database(engine) -> bool:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    # No core app table yet → treat as fresh, even if a failed migrate left debris.
    return "users" not in tables and "projects" not in tables


def _prepare_fresh_database(engine) -> None:
    """Skip broken early revisions; start from the schema-reset baseline."""
    print(
        f"[db-migrate] Fresh database detected — "
        f"stamping {PRE_RESET_REVISION} then upgrading to head..."
    )
    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        # Clear debris from a previous failed first migration, if any.
        for table in (
            "ai_messages",
            "ai_usage_logs",
            "ai_memory",
            "ai_conversations",
            "alembic_version",
        ):
            conn.execute(text(f"DROP TABLE IF EXISTS `{table}`"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))

    _run_alembic("stamp", PRE_RESET_REVISION)


def main() -> int:
    settings = get_settings()
    engine = create_engine(settings.database_url)

    if _is_fresh_database(engine):
        _prepare_fresh_database(engine)
    else:
        print("[db-migrate] Existing database detected — upgrading to head...")

    print("[db-migrate] Running alembic upgrade head...")
    _run_alembic("upgrade", "head")
    print("[db-migrate] Migrations complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
