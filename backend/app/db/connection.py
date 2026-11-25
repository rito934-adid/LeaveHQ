import os
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import pg8000
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")


def get_connection():
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    parsed = urlparse(database_url)

    options = parse_qs(parsed.query)
    ssl_mode = options.get("sslmode", ["require"])[0]
    return pg8000.connect(
        user=unquote(parsed.username or ""),
        password=unquote(parsed.password or ""),
        host=parsed.hostname,
        port=parsed.port or 5432,
        database=unquote(parsed.path.lstrip("/")),
        ssl_context=ssl_mode != "disable",
        timeout=15,
    )
