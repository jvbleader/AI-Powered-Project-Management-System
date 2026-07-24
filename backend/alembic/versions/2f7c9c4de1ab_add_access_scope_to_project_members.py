"""add access scope to project members

Revision ID: 2f7c9c4de1ab
Revises: 8c4a5f9f3c2d
Create Date: 2026-07-17 16:45:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "2f7c9c4de1ab"
down_revision: Union[str, Sequence[str], None] = "8c4a5f9f3c2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "project_members",
        sa.Column(
            "access_scope",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'member'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("project_members", "access_scope")
