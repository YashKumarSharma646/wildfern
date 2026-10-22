"""Test environment. pytest loads this before any test module, so the backend's settings
(read once at import time) always see a throwaway database and a known admin password."""

import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp()) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}"
os.environ["ADMIN_TOKEN"] = "test-admin-token"
os.environ["CAFE_TIMEZONE"] = "UTC"
for key in ("RESEND_API_KEY", "NOTIFY_EMAIL", "PASS_SECRET"):
    os.environ.pop(key, None)
