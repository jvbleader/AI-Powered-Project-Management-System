"""add independently persisted AI draft blocks

Revision ID: d7a3e5f1b2c4
Revises: b3e7f1a2c9d4
Create Date: 2026-08-21 12:15:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d7a3e5f1b2c4"
down_revision: Union[str, Sequence[str], None] = "b3e7f1a2c9d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_drafts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("fence", sa.String(length=64), nullable=False),
        sa.Column("block_index", sa.Integer(), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["message_id"], ["ai_messages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", "block_index", name="uq_ai_drafts_message_block"),
    )
    op.create_index(op.f("ix_ai_drafts_message_id"), "ai_drafts", ["message_id"], unique=False)
    op.create_index(op.f("ix_ai_drafts_status"), "ai_drafts", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_drafts_status"), table_name="ai_drafts")
    op.drop_index(op.f("ix_ai_drafts_message_id"), table_name="ai_drafts")
    op.drop_table("ai_drafts")
