"""Two-step sign-in and blocking.

Adds the encrypted authenticator secret to users (with when it was turned on and the last
30-second step accepted, so no code works twice), hashed one-time recovery codes, and the
blocks table.

Revision ID: 7a44454d249f
Revises: 81a5f813669c
Create Date: 2026-10-17 19:51:13.638250
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

import app.models.types

revision: str = "7a44454d249f"
down_revision: Union[str, None] = "81a5f813669c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "blocks",
        sa.Column("blocker_id", sa.Integer(), nullable=False),
        sa.Column("blocked_id", sa.Integer(), nullable=False),
        sa.Column("created_at", app.models.types.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["blocked_id"], ["users.id"], name=op.f("fk_blocks_blocked_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["blocker_id"], ["users.id"], name=op.f("fk_blocks_blocker_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("blocker_id", "blocked_id", name=op.f("pk_blocks")),
    )
    with op.batch_alter_table("blocks", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_blocks_blocked_id"), ["blocked_id"], unique=False)

    op.create_table(
        "recovery_codes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", app.models.types.UTCDateTime(), nullable=False),
        sa.Column("used_at", app.models.types.UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_recovery_codes_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recovery_codes")),
    )
    with op.batch_alter_table("recovery_codes", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_recovery_codes_user_id"), ["user_id"], unique=False)

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("totp_secret", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("totp_enabled_at", app.models.types.UTCDateTime(), nullable=True))
        batch_op.add_column(sa.Column("totp_last_step", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("totp_last_step")
        batch_op.drop_column("totp_enabled_at")
        batch_op.drop_column("totp_secret")

    with op.batch_alter_table("recovery_codes", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_recovery_codes_user_id"))
    op.drop_table("recovery_codes")

    with op.batch_alter_table("blocks", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_blocks_blocked_id"))
    op.drop_table("blocks")
