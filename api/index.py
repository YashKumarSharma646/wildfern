"""Vercel entry point: every /api/* request is rewritten here (see vercel.json)."""

import os
import sys

# Make the project root importable so `backend` resolves inside the serverless bundle.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app  # noqa: E402

__all__ = ["app"]
