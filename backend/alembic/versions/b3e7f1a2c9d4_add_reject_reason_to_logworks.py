"""add reject_reason to logworks

Revision ID: b3e7f1a2c9d4
Revises: a1b2c3d4e5f6
Create Date: 2026-08-12 16:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3e7f1a2c9d4"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("logworks", sa.Column("reject_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("logworks", "reject_reason")
