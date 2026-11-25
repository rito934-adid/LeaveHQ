import json
from datetime import date, datetime, time

from fastapi import HTTPException


def calculate_hours(kind: str, start: time | None, end: time | None) -> tuple[float, time, time]:
    if kind == "full_day":
        return 8.0, time(9, 0), time(18, 0)
    if kind == "first_half":
        return 4.0, time(9, 0), time(13, 0)
    if kind == "second_half":
        return 4.0, time(14, 0), time(18, 0)
    if kind != "custom_hours" or not start or not end or end <= start:
        raise HTTPException(400, "Custom leave requires a valid start and end time")
    if start < time(9, 0) or end > time(18, 0):
        raise HTTPException(400, "Custom hours must be within 9 AM and 6 PM")
    if start < time(14, 0) and end > time(13, 0):
        raise HTTPException(400, "Custom leave cannot include the 1 PM to 2 PM lunch break")
    hours = (datetime.combine(date.today(), end) - datetime.combine(date.today(), start)).total_seconds() / 3600
    if hours <= 0:
        raise HTTPException(400, "Custom leave duration must be greater than zero")
    return hours, start, end


def write_audit_log(cursor, admin_id: int, action: str, entity_type: str, entity_id: int | None, details: dict) -> None:
    cursor.execute(
        """
        INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
        VALUES (%s, %s, %s, %s, %s::jsonb)
        """,
        (admin_id, action, entity_type, entity_id, json.dumps(details)),
    )


def create_leave_records(cursor, admin_id: int, employee_id: int, leave_type_id: int, status: str,
                         reason: str | None, admin_remarks: str | None, dates: list) -> list[dict]:
    ensure_leave_references(cursor, employee_id, leave_type_id)
    calculated = []
    for item in dates:
        hours, start, end = calculate_hours(item.duration_type, item.start_time, item.end_time)
        calculated.append((item, hours, start, end))

    lock_employees(cursor, [employee_id])
    conflict = find_conflicting_leave(cursor, employee_id, calculated)
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=f"Leave overlaps an existing record on {conflict[0]}",
        )

    insert_values = []
    for item, hours, start, end in calculated:
        insert_values.append(
            (
                employee_id,
                leave_type_id,
                item.leave_date,
                item.leave_date,
                round(hours / 8, 2),
                status,
                reason,
                admin_remarks,
                item.duration_type,
                start,
                end,
                hours,
            )
        )
    row_sql = "(" + ", ".join(["%s"] * 12) + ")"
    cursor.execute(
        """
        INSERT INTO leave_records
        (employee_id, leave_type_id, start_date, end_date, total_days, status,
         reason, admin_remarks, duration_type, start_time, end_time, total_hours)
        VALUES """ + ", ".join([row_sql] * len(insert_values)) + " RETURNING id",
        tuple(value for row in insert_values for value in row),
    )
    created = [{"id": row[0]} for row in cursor.fetchall()]
    write_audit_log(
        cursor,
        admin_id,
        "create",
        "leave_records",
        created[0]["id"] if created else None,
        {"employee_id": employee_id, "leave_ids": [item["id"] for item in created]},
    )
    return created


def ensure_leave_references(cursor, employee_id: int, leave_type_id: int) -> None:
    cursor.execute(
        """
        SELECT EXISTS(SELECT 1 FROM employees WHERE id=%s),
               EXISTS(SELECT 1 FROM leave_types WHERE id=%s AND is_active=TRUE)
        """,
        (employee_id, leave_type_id),
    )
    employee_exists, leave_type_exists = cursor.fetchone()
    if not employee_exists:
        raise HTTPException(status_code=404, detail="Employee not found")
    if not leave_type_exists:
        raise HTTPException(status_code=404, detail="Active leave type not found")


def lock_employees(cursor, employee_ids: list[int]) -> None:
    for employee_id in sorted(set(employee_ids)):
        cursor.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"leavehq:employee:{employee_id}",),
        )


def find_conflicting_leave(cursor, employee_id: int, calculated: list, exclude_id: int | None = None):
    if not calculated:
        return None
    cursor.execute(
        f"""
        WITH requested(leave_date, start_time, end_time) AS
            (VALUES {", ".join(["(%s::date, %s::time, %s::time)"] * len(calculated))})
        SELECT requested.leave_date
        FROM requested
        JOIN leave_records existing
          ON existing.employee_id = %s
         AND existing.status <> 'cancelled'
         AND existing.start_date <= requested.leave_date
         AND existing.end_date >= requested.leave_date
         AND COALESCE(existing.start_time, TIME '09:00') < requested.end_time
         AND COALESCE(existing.end_time, TIME '18:00') > requested.start_time
         AND (CAST(%s AS BIGINT) IS NULL OR existing.id <> %s)
        LIMIT 1
        """,
        (
            *(value for item, _, start, end in calculated for value in (item.leave_date, start, end)),
            employee_id,
            exclude_id,
            exclude_id,
        ),
    )
    return cursor.fetchone()
