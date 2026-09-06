"""add title to logworks

Revision ID: f1a2b3c4d5e6
Revises: d7e8f9a0b1c2
Create Date: 2026-09-05 17:45:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("logworks", sa.Column("title", sa.String(length=255), nullable=True))
    op.execute(
        """
        UPDATE logworks
        SET title = CASE
            WHEN work_content IS NULL OR TRIM(work_content) = '' THEN 'Logwork'
            WHEN CHAR_LENGTH(TRIM(work_content)) <= 80 THEN TRIM(work_content)
            ELSE TRIM(SUBSTRING(TRIM(work_content), 1, 80))
        END
        WHERE title IS NULL OR TRIM(title) = ''
        """
    )
    op.alter_column(
        "logworks",
        "title",
        existing_type=sa.String(length=255),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("logworks", "title")
