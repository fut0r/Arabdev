"""Community publishing, reading collections and appearance preferences (1.4).

Revision ID: c14a20261028
Revises: 7a44454d249f
"""

import re
import unicodedata

import sqlalchemy as sa
from alembic import op

revision = "c14a20261028"
down_revision = "7a44454d249f"
branch_labels = None
depends_on = None


def _normalize(value):
    value = unicodedata.normalize("NFKC", value or "").casefold()
    value = re.sub(r"[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]", "", value)
    return " ".join(value.translate(str.maketrans("أإآٱى", "ااااي")).split())


def upgrade():
    id_type = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
    op.create_table(
        "github_identities",
        sa.Column("github_id", sa.String(32), primary_key=True),
        sa.Column("user_id", id_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "series",
        sa.Column("id", id_type, primary_key=True),
        sa.Column("author_id", id_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_series_author_id", "series", ["author_id"])
    op.create_table(
        "bookmark_collections",
        sa.Column("id", id_type, primary_key=True),
        sa.Column("user_id", id_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_bookmark_collections_user_id", "bookmark_collections", ["user_id"])
    for table in ("posts", "drafts"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("kind", sa.String(12), nullable=False, server_default="article"))
            batch.add_column(sa.Column("language", sa.String(8), nullable=False, server_default="auto"))
            batch.add_column(sa.Column("repository_url", sa.String(500)))
            batch.add_column(sa.Column("demo_url", sa.String(500)))
            batch.add_column(sa.Column("series_id", id_type))
            batch.add_column(sa.Column("series_order", sa.Integer(), nullable=False, server_default="1"))
            batch.create_foreign_key(f"fk_{table}_series_id", "series", ["series_id"], ["id"], ondelete="SET NULL")
            batch.create_index(f"ix_{table}_series_id", ["series_id"])
    with op.batch_alter_table("posts") as batch:
        batch.add_column(sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("search_title", sa.Text(), nullable=False, server_default=""))
        batch.add_column(sa.Column("search_text", sa.Text(), nullable=False, server_default=""))
        for column in ("kind", "language", "featured"):
            batch.create_index(f"ix_posts_{column}", [column])
    with op.batch_alter_table("drafts") as batch:
        batch.add_column(sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    with op.batch_alter_table("bookmarks") as batch:
        batch.add_column(sa.Column("collection_id", id_type))
        batch.add_column(sa.Column("note", sa.String(1000)))
        batch.create_foreign_key(
            "fk_bookmarks_collection_id", "bookmark_collections", ["collection_id"], ["id"], ondelete="SET NULL"
        )
        batch.create_index("ix_bookmarks_collection_id", ["collection_id"])
    op.create_table(
        "tag_follows",
        sa.Column("user_id", id_type, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", id_type, sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_tag_follows_tag_id", "tag_follows", ["tag_id"])
    op.create_table(
        "accepted_answers",
        sa.Column("post_id", id_type, sa.ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("comment_id", id_type, sa.ForeignKey("comments.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "digest_deliveries",
        sa.Column("user_id", id_type, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("week", sa.String(10), primary_key=True),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_digest_deliveries_created_at", "digest_deliveries", ["created_at"])
    with op.batch_alter_table("user_settings") as batch:
        for name, size, default in (
            ("accent_color", 7, "#D0152B"),
            ("font_family", 16, "tajawal"),
            ("background", 16, "plain"),
            ("density", 16, "comfortable"),
            ("reading_width", 12, "standard"),
        ):
            batch.add_column(sa.Column(name, sa.String(size), nullable=False, server_default=default))
        batch.add_column(sa.Column("font_size", sa.Integer(), nullable=False, server_default="16"))
        batch.add_column(sa.Column("email_weekly_digest", sa.Boolean(), nullable=False, server_default=sa.false()))
    # Bound batches avoid loading the site's complete article corpus into memory.
    connection = op.get_bind()
    last_id = 0
    while True:
        rows = (
            connection.execute(
                sa.text("SELECT id, title, content_text FROM posts WHERE id > :id ORDER BY id LIMIT 200"),
                {"id": last_id},
            )
            .mappings()
            .all()
        )
        if not rows:
            break
        for row in rows:
            content = row["content_text"] or ""
            ar = len(re.findall(r"[\u0621-\u064a]", content))
            en = len(re.findall(r"[a-zA-Z]", content))
            language = "mul" if min(ar, en) / max(ar + en, 1) >= 0.2 else "ar" if ar > en else "en"
            connection.execute(
                sa.text("UPDATE posts SET search_title=:title, search_text=:content, language=:language WHERE id=:id"),
                {
                    "id": row["id"],
                    "title": _normalize(row["title"]),
                    "content": _normalize(content),
                    "language": language,
                },
            )
        last_id = rows[-1]["id"]


def downgrade():
    op.drop_table("github_identities")
    for table in ("digest_deliveries", "accepted_answers", "tag_follows"):
        op.drop_table(table)
    with op.batch_alter_table("bookmarks") as batch:
        batch.drop_constraint("fk_bookmarks_collection_id", type_="foreignkey")
        batch.drop_index("ix_bookmarks_collection_id")
        batch.drop_column("collection_id")
        batch.drop_column("note")
    with op.batch_alter_table("user_settings") as batch:
        for name in (
            "accent_color",
            "font_family",
            "font_size",
            "background",
            "density",
            "reading_width",
            "email_weekly_digest",
        ):
            batch.drop_column(name)
    with op.batch_alter_table("posts") as batch:
        for name in ("kind", "language", "featured"):
            batch.drop_index(f"ix_posts_{name}")
        for name in ("featured", "search_title", "search_text"):
            batch.drop_column(name)
    with op.batch_alter_table("drafts") as batch:
        batch.drop_column("revision")
    for table in ("posts", "drafts"):
        with op.batch_alter_table(table) as batch:
            batch.drop_index(f"ix_{table}_series_id")
            batch.drop_constraint(f"fk_{table}_series_id", type_="foreignkey")
            for name in ("kind", "language", "repository_url", "demo_url", "series_id", "series_order"):
                batch.drop_column(name)
    op.drop_table("bookmark_collections")
    op.drop_table("series")
