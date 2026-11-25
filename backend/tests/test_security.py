from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core import security


class AuthCursor:
    def __init__(self, row):
        self.row = row

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, *_):
        pass

    def fetchone(self):
        return self.row


class AuthConnection:
    def __init__(self, row):
        self.fake_cursor = AuthCursor(row)

    def cursor(self):
        return self.fake_cursor

    def close(self):
        pass


def test_protected_request_requires_session(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret-with-at-least-32-chars")
    request = SimpleNamespace(cookies={}, method="GET", headers={})

    with pytest.raises(HTTPException) as error:
        security.get_current_admin(request)

    assert error.value.status_code == 401


def test_protected_mutation_requires_csrf_token(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret-with-at-least-32-chars")
    session_token, _ = security._new_session(7)
    request = SimpleNamespace(
        cookies={security.SESSION_COOKIE: session_token},
        method="POST",
        headers={},
    )

    with pytest.raises(HTTPException) as error:
        security.get_current_admin(request)

    assert error.value.status_code == 403


def test_unknown_username_still_verifies_dummy_password_hash(monkeypatch):
    verified_hashes = []
    connection = AuthConnection(None)
    monkeypatch.setattr(security, "get_connection", lambda: connection)
    monkeypatch.setattr(
        security.PASSWORD_HASHER,
        "verify",
        lambda password, encoded_hash: verified_hashes.append(encoded_hash) or False,
    )

    with pytest.raises(HTTPException) as error:
        security.authenticate_admin("missing-user", "incorrect-password", "test-client")

    assert error.value.status_code == 401
    assert verified_hashes == [security._DUMMY_PASSWORD_HASH]
