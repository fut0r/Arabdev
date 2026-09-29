"""Reports and moderation.

Adds the reports table (a member flags a post; moderators decide), when a post was hidden
because several people reported it, and how long an account is restricted from publishing
with the reason the moderators gave.

Revision ID: 81a5f813669c
Revises: bf7fdb1b7151
Create Date: 2026-09-29 21:13:11.571133
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

import app.models.types

revision: str = "81a5f813669c"
down_revision: Union[str, None] = "bf7fdb1b7151"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=True),
        sa.Column("post_author_id", sa.Integer(), nullable=True),
        sa.Column("reporter_id", sa.Integer(), nullable=True),
        sa.Column("reason", sa.String(length=20), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("post_title", sa.String(length=200), nullable=True),
        sa.Column("post_excerpt", sa.String(length=300), nullable=False),
        sa.Column("status", sa.String(length=12), server_default="open", nullable=False),
        sa.Column("action", sa.String(length=80), nullable=True),
        sa.Column("resolution_note", sa.String(length=500), nullable=True),
        sa.Column("moderator_id", sa.Integer(), nullable=True),
        sa.Column("created_at", app.models.types.UTCDateTime(), nullable=False),
        sa.Column("resolved_at", app.models.types.UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["moderator_id"], ["users.id"], name=op.f("fk_reports_moderator_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["post_author_id"], ["users.id"], name=op.f("fk_reports_post_author_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], name=op.f("fk_reports_post_id_posts"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["reporter_id"], ["users.id"], name=op.f("fk_reports_reporter_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reports")),
        sa.UniqueConstraint("post_id", "reporter_id", name="uq_reports_post_id_reporter_id"),
    )
    with op.batch_alter_table("reports", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_reports_post_author_id"), ["post_author_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_reports_post_id"), ["post_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_reports_reporter_id"), ["reporter_id"], unique=False)
        batch_op.create_index("ix_reports_status_created_at", ["status", "created_at"], unique=False)

    with op.batch_alter_table("posts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("hidden_at", app.models.types.UTCDateTime(), nullable=True))

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("restricted_until", app.models.types.UTCDateTime(), nullable=True))
        batch_op.add_column(sa.Column("restriction_reason", sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("restriction_reason")
        batch_op.drop_column("restricted_until")

    with op.batch_alter_table("posts", schema=None) as batch_op:
        batch_op.drop_column("hidden_at")

    with op.batch_alter_table("reports", schema=None) as batch_op:
        batch_op.drop_index("ix_reports_status_created_at")
        batch_op.drop_index(batch_op.f("ix_reports_reporter_id"))
        batch_op.drop_index(batch_op.f("ix_reports_post_id"))
        batch_op.drop_index(batch_op.f("ix_reports_post_author_id"))

    op.drop_table("reports")
