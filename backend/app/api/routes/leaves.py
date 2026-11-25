from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_admin
from app.db.connection import get_connection
from app.schemas.leaves import LeaveBatchCreate, LeaveCreate, LeaveDateInput, LeaveUpdate
from app.services.leaves import (
    calculate_hours,
    create_leave_records,
    find_conflicting_leave,
    lock_employees,
    write_audit_log,
)

router = APIRouter(prefix="/leaves", tags=["Leaves"])


def _format_time(value, default: str = "09:00") -> str:
    return value.strftime("%H:%M") if value else default


@router.get("/types")
def get_leave_types(admin: dict = Depends(get_current_admin)):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id,name,is_paid,is_active FROM leave_types WHERE is_active=TRUE ORDER BY name")
            return [
                {"id": row[0], "name": row[1], "is_paid": row[2], "is_active": row[3]}
                for row in cursor.fetchall()
            ]
    finally:
        connection.close()


@router.get("/")
def get_leaves(employee_id: int | None = None, admin: dict = Depends(get_current_admin)):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            query = """
                SELECT l.id,l.employee_id,e.employee_code,e.full_name,l.leave_type_id,
                       t.name,l.start_date,l.end_date,l.total_days,l.status,l.reason,
                       l.admin_remarks,l.duration_type,l.start_time,l.end_time,l.total_hours
                FROM leave_records l
                JOIN employees e ON e.id=l.employee_id
                JOIN leave_types t ON t.id=l.leave_type_id
            """
            if employee_id is not None:
                cursor.execute(
                    query + " WHERE l.employee_id=%s ORDER BY l.start_date DESC,l.start_time",
                    (employee_id,),
                )
            else:
                cursor.execute(query + " ORDER BY l.start_date DESC,l.start_time")
            return [
                {
                    "id": row[0],
                    "employee_id": row[1],
                    "employee_code": row[2],
                    "employee_name": row[3],
                    "leave_type_id": row[4],
                    "leave_type": row[5],
                    "start_date": str(row[6]),
                    "end_date": str(row[7]),
                    "total_days": float(row[8]),
                    "status": row[9],
                    "reason": row[10],
                    "admin_remarks": row[11],
                    "duration_type": row[12],
                    "start_time": _format_time(row[13]),
                    "end_time": _format_time(row[14], "18:00"),
                    "total_hours": float(row[15]) if row[15] is not None else float(row[8]) * 8,
                }
                for row in cursor.fetchall()
            ]
    finally:
        connection.close()


@router.post("/batch")
def create_leave_batch(leave: LeaveBatchCreate, admin: dict = Depends(get_current_admin)):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            created = create_leave_records(
                cursor,
                admin["id"],
                leave.employee_id,
                leave.leave_type_id,
                leave.status,
                leave.reason,
                leave.admin_remarks,
                leave.dates,
            )
        connection.commit()
        return {"created": created, "count": len(created), "message": "Leave recorded"}
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


@router.post("/")
def create_leave(leave: LeaveCreate, admin: dict = Depends(get_current_admin)):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            created = create_leave_records(
                cursor,
                admin["id"],
                leave.employee_id,
                leave.leave_type_id,
                leave.status,
                leave.reason,
                leave.admin_remarks,
                [
                    LeaveDateInput(
                        leave_date=leave.leave_date,
                        duration_type=leave.duration_type,
                        start_time=leave.start_time,
                        end_time=leave.end_time,
                    )
                ],
            )
        connection.commit()
        hours, _, _ = calculate_hours(leave.duration_type, leave.start_time, leave.end_time)
        return {
            "id": created[0]["id"],
            "total_hours": hours,
            "total_days": round(hours / 8, 2),
            "message": "Leave recorded",
        }
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


@router.put("/{leave_id}")
def update_leave(leave_id: int, leave: LeaveUpdate, admin: dict = Depends(get_current_admin)):
    hours, start, end = calculate_hours(leave.duration_type, leave.start_time, leave.end_time)
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT employee_id,start_date,end_date,status FROM leave_records WHERE id=%s FOR UPDATE",
                (leave_id,),
            )
            existing = cursor.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Leave record not found")
            if existing[3] == "cancelled":
                raise HTTPException(
                    status_code=409,
                    detail="Cancelled leave cannot be reopened. Record a new leave entry instead.",
                )
            if existing[1] != existing[2]:
                raise HTTPException(
                    status_code=409,
                    detail="Legacy multi-day leave cannot be edited as a single date. Cancel it and record corrected dates.",
                )

            lock_employees(cursor, [existing[0], leave.employee_id])
            cursor.execute(
                """
                SELECT EXISTS(SELECT 1 FROM employees WHERE id=%s),
                       EXISTS(SELECT 1 FROM leave_types WHERE id=%s AND is_active=TRUE)
                """,
                (leave.employee_id, leave.leave_type_id),
            )
            employee_exists, leave_type_exists = cursor.fetchone()
            if not employee_exists:
                raise HTTPException(status_code=404, detail="Employee not found")
            if not leave_type_exists:
                raise HTTPException(status_code=404, detail="Active leave type not found")
            conflict = find_conflicting_leave(
                cursor,
                leave.employee_id,
                [(
                    LeaveDateInput(
                        leave_date=leave.leave_date,
                        duration_type=leave.duration_type,
                        start_time=leave.start_time,
                        end_time=leave.end_time,
                    ),
                    hours,
                    start,
                    end,
                )],
                exclude_id=leave_id,
            )
            if conflict:
                raise HTTPException(
                    status_code=409,
                    detail=f"Leave overlaps an existing record on {conflict[0]}",
                )
            cursor.execute(
                """
                UPDATE leave_records
                SET employee_id=%s,leave_type_id=%s,start_date=%s,end_date=%s,total_days=%s,
                    status=%s,reason=%s,admin_remarks=%s,duration_type=%s,start_time=%s,
                    end_time=%s,total_hours=%s,updated_at=NOW()
                WHERE id=%s
                """,
                (
                    leave.employee_id,
                    leave.leave_type_id,
                    leave.leave_date,
                    leave.leave_date,
                    round(hours / 8, 2),
                    leave.status,
                    leave.reason,
                    leave.admin_remarks,
                    leave.duration_type,
                    start,
                    end,
                    hours,
                    leave_id,
                ),
            )
            write_audit_log(
                cursor,
                admin["id"],
                "update",
                "leave_records",
                leave_id,
                {"employee_id": leave.employee_id, "leave_date": str(leave.leave_date)},
            )
        connection.commit()
        return {"id": leave_id, "total_hours": hours, "total_days": round(hours / 8, 2), "message": "Leave updated"}
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


@router.patch("/{leave_id}/cancel")
def cancel_leave(leave_id: int, admin: dict = Depends(get_current_admin)):
    return _cancel_leave(leave_id, admin)


def _cancel_leave(leave_id: int, admin: dict):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT employee_id,status FROM leave_records WHERE id=%s FOR UPDATE",
                (leave_id,),
            )
            existing = cursor.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Leave record not found")
            if existing[1] == "cancelled":
                connection.commit()
                return {"id": leave_id, "status": "cancelled", "message": "Leave already cancelled"}

            lock_employees(cursor, [existing[0]])
            cursor.execute(
                "UPDATE leave_records SET status='cancelled',updated_at=NOW() WHERE id=%s",
                (leave_id,),
            )
            write_audit_log(
                cursor,
                admin["id"],
                "cancel",
                "leave_records",
                leave_id,
                {"previous_status": existing[1]},
            )
        connection.commit()
        return {"id": leave_id, "status": "cancelled", "message": "Leave cancelled"}
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


@router.delete("/{leave_id}")
def delete_leave(leave_id: int, admin: dict = Depends(get_current_admin)):
    return _cancel_leave(leave_id, admin)


@router.get("/collisions")
def get_collisions(admin: dict = Depends(get_current_admin)):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT overlap_days.overlap_at::date,a.id,b.id,ea.full_name,eb.full_name,
                       COALESCE(a.start_time,TIME '09:00'),
                       COALESCE(a.end_time,TIME '18:00'),
                       COALESCE(b.start_time,TIME '09:00'),
                       COALESCE(b.end_time,TIME '18:00')
                FROM leave_records a
                JOIN leave_records b
                  ON a.id < b.id
                 AND a.start_date <= b.end_date
                 AND b.start_date <= a.end_date
                JOIN employees ea ON ea.id=a.employee_id
                JOIN employees eb ON eb.id=b.employee_id
                CROSS JOIN LATERAL generate_series(
                    GREATEST(a.start_date,b.start_date)::timestamp,
                    LEAST(a.end_date,b.end_date)::timestamp,
                    INTERVAL '1 day'
                ) AS overlap_days(overlap_at)
                WHERE a.status<>'cancelled' AND b.status<>'cancelled'
                  AND a.employee_id<>b.employee_id
                  AND COALESCE(a.start_time,TIME '09:00') < COALESCE(b.end_time,TIME '18:00')
                  AND COALESCE(b.start_time,TIME '09:00') < COALESCE(a.end_time,TIME '18:00')
                ORDER BY overlap_days.overlap_at,a.id,b.id
                """
            )
            return [
                {
                    "date": str(row[0]),
                    "leave_id_1": row[1],
                    "leave_id_2": row[2],
                    "employee_1": row[3],
                    "employee_2": row[4],
                    "overlap_start": _format_time(max(row[5], row[7])),
                    "overlap_end": _format_time(min(row[6], row[8]), "18:00"),
                }
                for row in cursor.fetchall()
            ]
    finally:
        connection.close()
