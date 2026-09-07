"""add temporary deployment failure test

Revision ID: 9f4e7d2c1b0a
Revises: 40f928786ecb
Create Date: 2026-09-27 00:00:00.000000

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "9f4e7d2c1b0a"
down_revision: str | Sequence[str] | None = "40f928786ecb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass