from datetime import date, time
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes import leaves as leave_routes
from app.api.routes.employees import EmployeeData, _values
from app.schemas.leaves import LeaveBatchCreate, LeaveDateInput, LeaveUpdate
from app.services.leaves import calculate_hours, create_leave_records, find_conflicting_leave


class FakeCursor:
    def __init__(self, *, conflict=None, fail_audit=False, cancel_row=None, update_row=None):
        self.conflict = conflict
        self.fail_audit = fail_audit
        self.cancel_row = cancel_row
        self.update_row = update_row
        self.current = None
        self.statements = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, query, params=None):
        statement = query.strip()
        self.statements.append((statement, params))
        if statement.startswith("SELECT EXISTS"):
            self.current = (True, True)
        elif "SELECT employee_id,status FROM leave_records" in statement:
            self.current = self.cancel_row
        elif "SELECT employee_id,start_date,end_date,status" in statement:
            self.current = self.update_row
        elif "WITH requested" in statement:
            self.current = self.conflict
        elif statement.startswith("INSERT INTO leave_records"):
            self.current = [(101 + index,) for index in range(statement.count("), (") + 1)]
        elif statement.startswith("INSERT INTO audit_logs") and self.fail_audit:
            raise RuntimeError("simulated audit write failure")
        else:
            self.current = None

    def fetchone(self):
        return self.current

    def fetchall(self):
        return self.current or []


class FakeConnection:
    def __init__(self, cursor):
        self.fake_cursor = cursor
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def cursor(self):
        return self.fake_cursor

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


def test_duration_calculation_supports_full_and_non_overlapping_halves():
    assert calculate_hours("full_day", None, None) == (8.0, time(9), time(18))
    assert calculate_hours("first_half", None, None) == (4.0, time(9), time(13))
    assert calculate_hours("second_half", None, None) == (4.0, time(14), time(18))
    assert calculate_hours("custom_hours", time(10), time(12))[0] == 2


@pytest.mark.parametrize(
    ("start", "end"),
    [(time(12), time(14)), (time(18), time(18, 30)), (time(11), time(10))],
)
def test_custom_hours_reject_invalid_working_time(start, end):
    with pytest.raises(HTTPException) as error:
        calculate_hours("custom_hours", start, end)
    assert error.value.status_code == 400


def test_batch_schema_rejects_duplicate_dates():
    with pytest.raises(ValidationError):
        LeaveBatchCreate(
            employee_id=1,
            leave_type_id=1,
            dates=[
                {"leave_date": "2025-01-02"},
                {"leave_date": "2025-01-02", "duration_type": "second_half"},
            ],
        )


def test_batch_insert_uses_one_insert_and_records_audit():
    cursor = FakeCursor()
    dates = [
        LeaveDateInput(leave_date=date(2025, 1, 2)),
        LeaveDateInput(leave_date=date(2025, 1, 3), duration_type="second_half"),
    ]

    created = create_leave_records(cursor, 9, 4, 2, "planned", None, None, dates)

    insert_statements = [
        statement for statement, _ in cursor.statements
        if statement.startswith("INSERT INTO leave_records")
    ]
    assert len(insert_statements) == 1
    assert len(created) == 2
    assert any(statement.startswith("INSERT INTO audit_logs") for statement, _ in cursor.statements)


def test_batch_conflict_prevents_insert():
    cursor = FakeCursor(conflict=(date(2025, 1, 2),))

    with pytest.raises(HTTPException) as error:
        create_leave_records(
            cursor,
            9,
            4,
            2,
            "taken",
            None,
            None,
            [LeaveDateInput(leave_date=date(2025, 1, 2))],
        )

    assert error.value.status_code == 409
    assert not any(statement.startswith("INSERT INTO leave_records") for statement, _ in cursor.statements)


def test_batch_route_rolls_back_if_audit_write_fails(monkeypatch):
    cursor = FakeCursor(fail_audit=True)
    connection = FakeConnection(cursor)
    monkeypatch.setattr(leave_routes, "get_connection", lambda: connection)
    payload = LeaveBatchCreate(
        employee_id=4,
        leave_type_id=2,
        dates=[{"leave_date": "2025-01-02"}],
    )

    with pytest.raises(RuntimeError, match="simulated audit write failure"):
        leave_routes.create_leave_batch(payload, {"id": 9})

    assert connection.rolled_back
    assert not connection.committed
    assert connection.closed


def test_batch_route_commits_success_atomically(monkeypatch):
    cursor = FakeCursor()
    connection = FakeConnection(cursor)
    monkeypatch.setattr(leave_routes, "get_connection", lambda: connection)
    payload = LeaveBatchCreate(
        employee_id=4,
        leave_type_id=2,
        dates=[
            {"leave_date": "2025-01-02"},
            {"leave_date": "2025-01-03", "duration_type": "first_half"},
        ],
    )

    response = leave_routes.create_leave_batch(payload, {"id": 9})

    assert response["count"] == 2
    assert connection.committed
    assert not connection.rolled_back
    assert connection.closed


def test_legacy_delete_endpoint_cancels_without_physical_delete(monkeypatch):
    cursor = FakeCursor(cancel_row=(4, "planned"))
    connection = FakeConnection(cursor)
    monkeypatch.setattr(leave_routes, "get_connection", lambda: connection)

    response = leave_routes.delete_leave(101, {"id": 9})

    statements = [statement for statement, _ in cursor.statements]
    assert response["status"] == "cancelled"
    assert any("SET status='cancelled'" in statement for statement in statements)
    assert not any(statement.startswith("DELETE FROM leave_records") for statement in statements)
    assert connection.committed


def test_cancelled_leave_cannot_be_reactivated_by_update(monkeypatch):
    cursor = FakeCursor(update_row=(4, date(2025, 1, 2), date(2025, 1, 2), "cancelled"))
    connection = FakeConnection(cursor)
    monkeypatch.setattr(leave_routes, "get_connection", lambda: connection)
    payload = LeaveUpdate(
        employee_id=4,
        leave_type_id=2,
        leave_date=date(2025, 1, 2),
        duration_type="full_day",
        status="taken",
    )

    with pytest.raises(HTTPException) as error:
        leave_routes.update_leave(101, payload, {"id": 9})

    assert error.value.status_code == 409
    assert not any(statement.startswith("UPDATE leave_records") for statement, _ in cursor.statements)
    assert connection.rolled_back


def test_empty_leave_request_does_not_build_invalid_sql():
    class NoQueriesCursor:
        def execute(self, *_):
            raise AssertionError("no query should be issued for an empty request")

    assert find_conflicting_leave(NoQueriesCursor(), 4, []) is None


def test_fresh_schema_includes_time_based_columns():
    schema = (Path(__file__).resolve().parents[1] / "app" / "db" / "schema.sql").read_text(encoding="utf-8")
    for column in ("duration_type", "start_time", "end_time", "total_hours"):
        assert column in schema


def test_employee_payload_uses_explicit_field_order_and_validates_email():
    employee = EmployeeData(employee_code="A1", full_name="Test User", email="")
    assert _values(employee) == ("A1", "Test User", None, None, None, None, "active")

    with pytest.raises(ValidationError):
        EmployeeData(employee_code="A2", full_name="Bad Email", email="not-an-email")

    with pytest.raises(ValidationError):
        EmployeeData(employee_code="X" * 31, full_name="Too Long")
