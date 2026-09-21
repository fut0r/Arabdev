"""Emailed six-digit codes, plus the settings that go with them.

Adds the verification_codes table behind sign-in, sign-up, email and password changes,
two timestamps on users (when the password last changed, when the address was confirmed)
and five new preferences: the default feed, reduced motion, whether a sign-in needs a
code, and the two email opt-ins.

Revision ID: bf7fdb1b7151
Revises: a1d4e2b7c9f3
Create Date: 2026-09-21 20:06:29.981255
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

import app.models.types

revision: str = "bf7fdb1b7151"
down_revision: Union[str, None] = "a1d4e2b7c9f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "verification_codes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("challenge_id", sa.String(length=36), nullable=False),
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column("language", sa.String(length=5), server_default="ar", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("resends", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("sent_at", app.models.types.UTCDateTime(), nullable=False),
        sa.Column("expires_at", app.models.types.UTCDateTime(), nullable=False),
        sa.Column("consumed_at", app.models.types.UTCDateTime(), nullable=True),
        sa.Column("created_at", app.models.types.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_verification_codes_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_verification_codes")),
    )
    with op.batch_alter_table("verification_codes", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_verification_codes_challenge_id"), ["challenge_id"], unique=True)
        batch_op.create_index(batch_op.f("ix_verification_codes_email"), ["email"], unique=False)
        batch_op.create_index(batch_op.f("ix_verification_codes_expires_at"), ["expires_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_verification_codes_purpose"), ["purpose"], unique=False)
        batch_op.create_index(batch_op.f("ix_verification_codes_user_id"), ["user_id"], unique=False)

    # PostgreSQL rejects '0'/'1' as boolean defaults, so use the portable false()/true().
    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.add_column(sa.Column("default_feed", sa.String(length=10), server_default="for_you", nullable=False))
        batch_op.add_column(sa.Column("reduce_motion", sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.add_column(sa.Column("login_code_required", sa.Boolean(), server_default=sa.true(), nullable=False))
        batch_op.add_column(sa.Column("email_security_alerts", sa.Boolean(), server_default=sa.true(), nullable=False))
        batch_op.add_column(sa.Column("email_product_updates", sa.Boolean(), server_default=sa.false(), nullable=False))

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("password_changed_at", app.models.types.UTCDateTime(), nullable=True))
        batch_op.add_column(sa.Column("email_verified_at", app.models.types.UTCDateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("email_verified_at")
        batch_op.drop_column("password_changed_at")

    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.drop_column("email_product_updates")
        batch_op.drop_column("email_security_alerts")
        batch_op.drop_column("login_code_required")
        batch_op.drop_column("reduce_motion")
        batch_op.drop_column("default_feed")

    with op.batch_alter_table("verification_codes", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_verification_codes_user_id"))
        batch_op.drop_index(batch_op.f("ix_verification_codes_purpose"))
        batch_op.drop_index(batch_op.f("ix_verification_codes_expires_at"))
        batch_op.drop_index(batch_op.f("ix_verification_codes_email"))
        batch_op.drop_index(batch_op.f("ix_verification_codes_challenge_id"))

    op.drop_table("verification_codes")
