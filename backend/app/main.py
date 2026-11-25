import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException

from app.api.routes.auth import router as auth_router
from app.api.routes.employees import router as employees_router
from app.api.routes.leaves import router as leaves_router
from app.db.connection import get_connection

logger = logging.getLogger(__name__)
app = FastAPI(title="LeaveHQ API", version="1.0.0")

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "" if os.getenv("APP_ENV", "development").lower() == "production"
        else "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
if "*" in allowed_origins:
    raise RuntimeError("CORS_ORIGINS must list exact origins when credentials are enabled")
if (
    os.getenv("APP_ENV", "development").lower() == "production"
    and len(os.getenv("SESSION_SECRET", "")) < 32
):
    raise RuntimeError("SESSION_SECRET must be configured with at least 32 characters in production")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(employees_router, prefix="/api")
app.include_router(leaves_router, prefix="/api")

@app.get("/api/health")
def health():
    connection = None
    try:
        connection = get_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return {"status": "healthy", "database": "connected", "app": "LeaveHQ"}
    except Exception as error:
        logger.exception("Database health check failed")
        if connection is not None:
            connection.rollback()
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    finally:
        if connection is not None:
            connection.close()
