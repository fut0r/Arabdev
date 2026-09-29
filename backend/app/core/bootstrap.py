"""Prepare the database when the app starts on a serverless host.

Vercel has no deploy-time hook for migrations, so the first request on each new instance runs
this. It is quick when there is nothing to do, and a PostgreSQL advisory lock makes instances
that start together wait for each other instead of racing.
"""

import logging

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.core.config import BASE_DIR, settings

logger = logging.getLogger("arabdev.bootstrap")

# Any constant works; it only has to be the same for every instance.
_MIGRATION_LOCK_ID = 7_274_331


def prepare_database() -> None:
    from app.cli import seed_reference_data
    from app.services.auth_service import purge_expired_tokens
    from app.services.report_service import purge_resolved

    config = Config()  # configured in code, so alembic.ini is not needed at runtime
    config.set_main_option("script_location", str(BASE_DIR / "alembic"))

    engine = create_engine(settings.migration_url, poolclass=NullPool)
    try:
        with engine.begin() as connection:
            if connection.dialect.name == "postgresql":
                connection.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": _MIGRATION_LOCK_ID})
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            with Session(bind=connection, join_transaction_mode="create_savepoint") as db:
                seed_reference_data(db)
                purge_expired_tokens(db)
                purge_resolved(db)
    finally:
        engine.dispose()
    logger.info("Database is up to date")
