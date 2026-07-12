"""normalize task statuses to three workflow states

Revision ID: 9f0f5d4f65b7
Revises: 5c27d0324fd2
Create Date: 2026-07-11 23:58:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "9f0f5d4f65b7"
down_revision: Union[str, Sequence[str], None] = "5c27d0324fd2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE tasks
        SET status = 'in_progress'
        WHERE status IN ('review', 'blocked')
        """
    )


def downgrade() -> None:
    pass
