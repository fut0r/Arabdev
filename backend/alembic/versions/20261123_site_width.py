"""Store the site layout width separately from the article reading width."""

import sqlalchemy as sa
from alembic import op

revision = "ad1411123"
down_revision = "c14a20261028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_settings", sa.Column("site_width", sa.String(12), nullable=False, server_default="wide"))


def downgrade() -> None:
    op.drop_column("user_settings", "site_width")
