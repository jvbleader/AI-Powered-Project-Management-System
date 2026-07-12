"""repair project member active defaults

Revision ID: c53a6b09f71b
Revises: 9f0f5d4f65b7
Create Date: 2026-07-12 16:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c53a6b09f71b"
down_revision: Union[str, Sequence[str], None] = "9f0f5d4f65b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    op.alter_column(
        "project_members",
        "is_active",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.true(),
    )

    op.execute(
        """
        UPDATE project_members
        SET is_active = TRUE
        WHERE is_active IS NULL
        """
    )

    has_any_active = bind.execute(
        sa.text("SELECT 1 FROM project_members WHERE is_active = TRUE LIMIT 1")
    ).scalar()
    if not has_any_active:
        op.execute(
            """
            UPDATE project_members
            SET is_active = TRUE
            WHERE is_active = FALSE
            """
        )


def downgrade() -> None:
    op.alter_column(
        "project_members",
        "is_active",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=None,
    )
