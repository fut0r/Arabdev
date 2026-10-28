"""Disposable local API for browser tests. Never reads the developer database or sends mail."""
import os
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
cache = root / ".cache"
cache.mkdir(exist_ok=True)
run = Path(tempfile.mkdtemp(prefix="e2e-", dir=cache))
os.environ.update({"DATABASE_URL": "sqlite:///" + (run / "test.db").as_posix(), "DATABASE_URL_UNPOOLED": "",
    "ENVIRONMENT": "test", "VERCEL": "false", "AUTO_MIGRATE": "true", "STORAGE_BACKEND": "local",
    "MEDIA_ROOT": str(run / "media"), "SMTP_HOST": "", "EMAIL_CODES_ENABLED": "false",
    "TURNSTILE_SITE_KEY": "", "TURNSTILE_SECRET_KEY": "", "PWNED_PASSWORDS_ENABLED": "false",
    "INDEXNOW_ENABLED": "false", "RATE_LIMIT_ENABLED": "false", "REDIS_URL": "",
    "WEEKLY_DIGEST_ENABLED": "false", "GITHUB_CLIENT_ID": "", "GITHUB_CLIENT_SECRET": "",
    "SECRET_KEY": "isolated-browser-test-secret-not-for-deployment-1.4", "COOKIE_SECURE": "false",
    "FRONTEND_URL": "http://127.0.0.1:5174", "CORS_ORIGINS": "http://127.0.0.1:5174"})
sys.path.insert(0, str(root / "backend"))
from app.core.bootstrap import prepare_database
prepare_database()
import uvicorn
uvicorn.run("app.main:app", host="127.0.0.1", port=8014)
