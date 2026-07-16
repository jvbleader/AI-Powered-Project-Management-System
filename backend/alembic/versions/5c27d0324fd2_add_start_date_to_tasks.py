"""add start_date to tasks

Revision ID: 5c27d0324fd2
Revises: 946e2d6799af
Create Date: 2026-07-11 18:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5c27d0324fd2"
down_revision: Union[str, Sequence[str], None] = "946e2d6799af"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("start_date", sa.Date(), nullable=True))
    op.execute(
        """
        UPDATE tasks
        SET start_date = COALESCE(DATE(created_at), deadline, CURDATE())
        WHERE start_date IS NULL
        """
    )
    op.alter_column("tasks", "start_date", existing_type=sa.Date(), nullable=False)
    op.create_index(op.f("ix_tasks_start_date"), "tasks", ["start_date"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tasks_start_date"), table_name="tasks")
    op.drop_column("tasks", "start_date")
