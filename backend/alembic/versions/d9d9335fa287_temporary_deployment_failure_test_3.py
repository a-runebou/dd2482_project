"""temporary deployment failure test 3

Revision ID: d9d9335fa287
Revises: b3e00e2ff2a5
Create Date: 2026-09-27 15:21:44.567071

"""
import os
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd9d9335fa287'
down_revision: Union[str, Sequence[str], None] = 'b3e00e2ff2a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    if os.getenv("SCHEDULAR_TEST_MIGRATION_FAILURE") == "true":
        op.execute("THIS IS INTENTIONALLY INVALID SQL")


def downgrade() -> None:
    """Downgrade schema."""
    pass
