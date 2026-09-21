"""Hosting on Vercel: images kept in the database, the scheduled clean-up, and settings."""

from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.core.config import Settings, settings
from app.main import create_app
from app.models import Media
from app.services.storage import get_storage
from tests.conftest import API, PASSWORD, image_bytes


@pytest.fixture
def database_storage_client(monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "database")
    get_storage.cache_clear()
    with TestClient(create_app()) as test_client:
        test_client.headers["X-ArabDev-Client"] = "tests"
        yield test_client
    get_storage.cache_clear()


def register(client, username="layla"):
    response = client.post(
        f"{API}/auth/register",
        json={"username": username, "email": f"{username}@example.com", "password": PASSWORD, "password_confirm": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['tokens']['access_token']}"}


def test_images_are_stored_in_and_served_from_the_database(database_storage_client, db):
    client = database_storage_client
    headers = register(client)
    response = client.post(
        f"{API}/users/me/avatar", files={"file": ("me.png", image_bytes((900, 600)), "image/png")}, headers=headers
    )
    assert response.status_code == 200, response.text
    url = response.json()["avatar_url"]
    assert url.startswith("/media/avatar/")

    stored = db.scalar(select(Media))
    assert stored.data and stored.size_bytes == len(stored.data)

    served = client.get(url)
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/webp"
    assert "immutable" in served.headers["cache-control"]
    assert Image.open(BytesIO(served.content)).size == (400, 400)

    assert client.head(url).status_code == 200  # caches ask for headers only
    assert client.get("/media/avatar/missing.webp").status_code == 404
    client.delete(f"{API}/users/me/avatar", headers=headers)
    assert client.get(url).status_code == 404  # the bytes went with the row


def test_scheduled_cleanup_requires_the_cron_secret(client, monkeypatch):
    path = f"{API}/internal/cron/purge-tokens"
    assert client.get(path).status_code == 404  # hidden unless CRON_SECRET is configured

    monkeypatch.setattr(settings, "cron_secret", "s3cret-value")
    assert client.get(path).status_code == 401
    assert client.get(path, headers={"Authorization": "Bearer wrong"}).status_code == 401
    ok = client.get(path, headers={"Authorization": "Bearer s3cret-value"})
    assert ok.status_code == 200
    assert ok.json() == {"sessions_deleted": 0, "reset_links_deleted": 0}


def test_hosted_postgres_urls_use_the_psycopg_driver():
    for url in ("postgres://u:p@host/db?sslmode=require", "postgresql://u:p@host/db?sslmode=require"):
        assert Settings(_env_file=None, database_url=url).database_url == "postgresql+psycopg://u:p@host/db?sslmode=require"
    assert Settings(_env_file=None, database_url="sqlite:///x.db").database_url == "sqlite:///x.db"


def test_vercel_defaults(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    hosted = Settings(_env_file=None, database_url="postgres://u:p@host/db", secret_key="k" * 48)
    assert hosted.environment == "production"
    assert hosted.storage_backend == "database"
    assert hosted.cookie_secure is True
    assert hosted.frontend_url == "https://arabdev.site"

    with pytest.raises(ValueError, match="PostgreSQL"):
        Settings(_env_file=None, database_url="sqlite:///x.db", secret_key="k" * 48)
