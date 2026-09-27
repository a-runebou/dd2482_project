"""temporary deployment failure test 2

Revision ID: b3e00e2ff2a5
Revises: 9f4e7d2c1b0a
Create Date: 2026-09-27 15:12:25.204729

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3e00e2ff2a5'
down_revision: Union[str, Sequence[str], None] = '9f4e7d2c1b0a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
