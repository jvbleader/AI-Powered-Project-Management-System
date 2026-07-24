"""add status to logworks

Revision ID: 42d4fb91fe3a
Revises: 4d6782b4f019
Create Date: 2026-07-19 04:33:01.149427

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '42d4fb91fe3a'
down_revision: Union[str, Sequence[str], None] = '4d6782b4f019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('logworks', sa.Column('status', sa.String(length=50), nullable=False, server_default='PENDING'))
    op.create_index(op.f('ix_logworks_status'), 'logworks', ['status'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_logworks_status'), table_name='logworks')
    op.drop_column('logworks', 'status')
