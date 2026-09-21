"""Test setup: every test runs against a fresh in-memory SQLite database.

Set TEST_DATABASE_URL (e.g. sqlite:///./test.db) to inspect the data in a file instead.
"""

import io
import os
import tempfile

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite://")
os.environ["ENVIRONMENT"] = "test"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["REDIS_URL"] = ""
os.environ["MEDIA_ROOT"] = tempfile.mkdtemp(prefix="arabdev-media-")
# Tests must not depend on whatever backend/.env happens to hold: no mail provider, no
# emailed codes and no Turnstile unless a test switches them on for itself.
os.environ["SMTP_HOST"] = ""
os.environ["EMAIL_CODES_ENABLED"] = "false"
os.environ["TURNSTILE_SITE_KEY"] = ""
os.environ["TURNSTILE_SECRET_KEY"] = ""

from dataclasses import dataclass  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app.cli import seed_reference_data  # noqa: E402
from app.core import cache  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.rate_limit import _memory_limiter  # noqa: E402
from app.main import app  # noqa: E402

API = "/api/v1"
PASSWORD = "Sunrise2026"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _clean_database():
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())
    with SessionLocal() as db:
        seed_reference_data(db)
    cache.cache_clear()
    _memory_limiter.reset()
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        test_client.headers["X-ArabDev-Client"] = "tests"
        yield test_client


@dataclass
class Account:
    id: int
    username: str
    email: str
    token: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


@pytest.fixture
def make_user(client):
    def _make(username: str = "layla", email: str | None = None, password: str = PASSWORD) -> Account:
        email = email or f"{username}@example.com"
        response = client.post(
            f"{API}/auth/register",
            json={"username": username, "email": email, "password": password, "password_confirm": password},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        # Without a mail provider the test settings create the account straight away;
        # the emailed-code path has its own tests.
        assert body["status"] == "authenticated", body
        tokens = body["tokens"]
        return Account(id=tokens["user"]["id"], username=username, email=email, token=tokens["access_token"])

    return _make


@pytest.fixture
def make_post(client):
    def _make(account: Account, content: str = "<p>Hello ArabDev</p>", **extra) -> dict:
        payload = {"content_html": content, **extra}
        response = client.post(f"{API}/posts", json=payload, headers=account.headers)
        assert response.status_code == 201, response.text
        return response.json()

    return _make


def image_bytes(size=(400, 300), fmt="PNG", color=(200, 30, 40)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format=fmt)
    return buffer.getvalue()
