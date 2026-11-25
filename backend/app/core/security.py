import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, Response
from pwdlib import PasswordHash
from pwdlib.exceptions import PwdlibError

from app.db.connection import get_connection

SESSION_COOKIE = "leavehq_session"
SESSION_TTL_SECONDS = 8 * 60 * 60
PASSWORD_HASHER = PasswordHash.recommended()
_DUMMY_PASSWORD_HASH = PASSWORD_HASHER.hash(secrets.token_urlsafe(32))
_login_failures: dict[str, deque[float]] = defaultdict(deque)
_login_lock = threading.Lock()
_MAX_LOGIN_FAILURES = 5
_LOGIN_WINDOW_SECONDS = 15 * 60


def _session_secret() -> bytes:
    secret = os.getenv("SESSION_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("SESSION_SECRET must be configured with at least 32 characters")
    return secret.encode("utf-8")


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _sign(payload: bytes) -> str:
    return _encode(hmac.new(_session_secret(), payload, hashlib.sha256).digest())


def _read_session(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        payload_part, signature = token.split(".", 1)
        payload = _decode(payload_part)
        if not hmac.compare_digest(_sign(payload), signature):
            return None
        session = json.loads(payload)
        if not isinstance(session.get("admin_id"), int) or session.get("expires_at", 0) <= int(time.time()):
            return None
        return session
    except (AttributeError, ValueError, TypeError, json.JSONDecodeError):
        return None


def _new_session(admin_id: int) -> tuple[str, str]:
    csrf_token = secrets.token_urlsafe(32)
    payload = json.dumps(
        {
            "admin_id": admin_id,
            "csrf_token": csrf_token,
            "expires_at": int(time.time()) + SESSION_TTL_SECONDS,
        },
        separators=(",", ":"),
    ).encode("utf-8")
    return f"{_encode(payload)}.{_sign(payload)}", csrf_token


def _cookie_secure() -> bool:
    return os.getenv("APP_ENV", "development").lower() != "development"


def set_session_cookie(response: Response, admin_id: int) -> str:
    token, csrf_token = _new_session(admin_id)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/",
    )
    return csrf_token


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/",
    )


def get_session(request: Request) -> dict:
    session = _read_session(request.cookies.get(SESSION_COOKIE))
    if session is None:
        raise HTTPException(status_code=401, detail="Administrator sign-in required")
    return session


def require_csrf(request: Request, session: dict) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    supplied = request.headers.get("X-CSRF-Token", "")
    expected = session.get("csrf_token", "")
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=403, detail="Invalid CSRF token")


def _login_is_limited(client_key: str, now: float) -> bool:
    with _login_lock:
        for key, attempts in list(_login_failures.items()):
            while attempts and now - attempts[0] >= _LOGIN_WINDOW_SECONDS:
                attempts.popleft()
            if not attempts:
                _login_failures.pop(key, None)
        failures = _login_failures[client_key]
        return len(failures) >= _MAX_LOGIN_FAILURES


def _record_login_failure(client_key: str, now: float) -> None:
    with _login_lock:
        failures = _login_failures[client_key]
        while failures and now - failures[0] >= _LOGIN_WINDOW_SECONDS:
            failures.popleft()
        failures.append(now)


def _clear_login_failures(client_key: str) -> None:
    with _login_lock:
        _login_failures.pop(client_key, None)


def authenticate_admin(username: str, password: str, client_key: str) -> int:
    now = time.monotonic()
    if _login_is_limited(client_key, now):
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again later.")

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, password_hash FROM admins WHERE username=%s AND is_active=TRUE",
                (username,),
            )
            admin = cursor.fetchone()
    finally:
        connection.close()

    try:
        stored_hash = admin[1] if admin else _DUMMY_PASSWORD_HASH
        password_matches = PASSWORD_HASHER.verify(password, stored_hash)
    except (PwdlibError, ValueError, TypeError):
        password_matches = False
    valid = bool(admin) and password_matches
    if not valid:
        _record_login_failure(client_key, now)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    _clear_login_failures(client_key)
    return admin[0]


def get_current_admin(request: Request) -> dict:
    session = get_session(request)
    require_csrf(request, session)
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, username FROM admins WHERE id=%s AND is_active=TRUE",
                (session["admin_id"],),
            )
            admin = cursor.fetchone()
    finally:
        connection.close()
    if not admin:
        raise HTTPException(status_code=401, detail="Administrator account is inactive")
    return {"id": admin[0], "username": admin[1], "csrf_token": session["csrf_token"]}
