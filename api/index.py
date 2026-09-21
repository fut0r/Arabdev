"""Vercel entry point: serves the ArabDev API (backend/app) as a Python function.

vercel.json sends /api/*, /media/* and /sitemap.xml here; everything else is the static app in
frontend/dist.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.core.config import settings  # noqa: E402

if settings.auto_migrate:
    from app.core.bootstrap import prepare_database  # noqa: E402

    prepare_database()

from app.main import app  # noqa: E402, F401  (Vercel serves this ASGI app)
