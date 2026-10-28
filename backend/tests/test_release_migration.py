"""Upgrade existing content, downgrade, and re-upgrade without losing relationships."""

import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command


@pytest.mark.parametrize("dialect", ["sqlite", "postgresql"])
def test_release_migration_preserves_content(tmp_path, dialect):
    url = f"sqlite:///{tmp_path / 'migration.db'}"
    if dialect == "postgresql":
        url = os.environ.get("MIGRATION_TEST_DATABASE_URL")
        if not url:
            pytest.skip("Set MIGRATION_TEST_DATABASE_URL to an isolated PostgreSQL test database")
    engine = sa.create_engine(url)
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
    with engine.begin() as connection:
        schema = "migration_" + uuid.uuid4().hex
        if dialect == "postgresql":
            connection.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
            connection.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
        config.attributes["connection"] = connection
        command.upgrade(config, "7a44454d249f")
        metadata = sa.MetaData()
        metadata.reflect(connection)
        now = datetime.now(UTC)
        connection.execute(
            metadata.tables["users"].insert(),
            {
                "id": 1,
                "username": "existing",
                "email": "existing@example.com",
                "hashed_password": "not-a-secret",
                "created_at": now,
                "updated_at": now,
            },
        )
        connection.execute(
            metadata.tables["posts"].insert(),
            {
                "id": 1,
                "author_id": 1,
                "title": "إدارة المشاريع",
                "content_html": "<p>أهلا بالمطورين</p>",
                "content_text": "أهلا بالمطورين",
                "created_at": now,
                "updated_at": now,
            },
        )
        connection.execute(metadata.tables["bookmarks"].insert(), {"user_id": 1, "post_id": 1, "created_at": now})
        connection.execute(
            metadata.tables["comments"].insert(),
            {
                "id": 1,
                "author_id": 1,
                "post_id": 1,
                "content": "Preserved comment",
                "created_at": now,
            },
        )
        command.upgrade(config, "head")
        post = connection.execute(sa.text("SELECT title, search_title, language, kind FROM posts")).one()
        assert post == ("إدارة المشاريع", "ادارة المشاريع", "ar", "article")
        assert connection.scalar(sa.text("SELECT COUNT(*) FROM comments")) == 1
        assert connection.scalar(sa.text("SELECT COUNT(*) FROM bookmarks")) == 1
        command.downgrade(config, "7a44454d249f")
        assert connection.scalar(sa.text("SELECT title FROM posts")) == "إدارة المشاريع"
        command.upgrade(config, "head")
        assert connection.scalar(sa.text("SELECT COUNT(*) FROM bookmarks")) == 1
        if dialect == "sqlite":
            assert connection.execute(sa.text("PRAGMA foreign_key_check")).all() == []
        else:
            connection.execute(sa.text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()
