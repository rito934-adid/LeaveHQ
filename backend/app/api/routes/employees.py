from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pg8000.dbapi import IntegrityError
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import get_current_admin
from app.db.connection import get_connection
from app.services.leaves import write_audit_log

router = APIRouter(prefix="/employees", tags=["Employees"])


class EmployeeData(BaseModel):
    employee_code: str = Field(min_length=1, max_length=30)
    full_name: str = Field(min_length=1, max_length=150)
    email: EmailStr | None = None
    department_id: int | None = None
    designation: str | None = Field(default=None, max_length=120)
    joining_date: date | None = None
    employment_status: Literal["active", "inactive"] = "active"

    @field_validator("email", mode="before")
    def blank_email_is_none(cls, value):
        return value or None


def _values(employee: EmployeeData) -> tuple:
    return (
        employee.employee_code,
        employee.full_name,
        employee.email,
        employee.department_id,
        employee.designation,
        employee.joining_date,
        employee.employment_status,
    )


def _ensure_department(cursor, department_id: int | None) -> None:
    if department_id is None:
        return
    cursor.execute("SELECT EXISTS(SELECT 1 FROM departments WHERE id=%s)", (department_id,))
    if not cursor.fetchone()[0]:
        raise HTTPException(status_code=422, detail="Department not found")


@router.get("/")
def get_employees(admin: dict = Depends(get_current_admin)):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, employee_code, full_name, email, department_id,
                       designation, employment_status
                FROM employees ORDER BY full_name
            """)
            return [
                dict(id=r[0], employee_code=r[1], full_name=r[2], email=r[3],
                     department_id=r[4], designation=r[5], employment_status=r[6])
                for r in cur.fetchall()
            ]
    finally:
        conn.close()


@router.post("/")
def create_employee(employee: EmployeeData, admin: dict = Depends(get_current_admin)):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _ensure_department(cur, employee.department_id)
            cur.execute("""
                INSERT INTO employees
                (employee_code, full_name, email, department_id, designation, joining_date, employment_status)
                VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id
            """, _values(employee))
            new_id = cur.fetchone()[0]
            write_audit_log(
                cur,
                admin["id"],
                "create",
                "employees",
                new_id,
                {"employee_code": employee.employee_code},
            )
        conn.commit()
        return {"id": new_id, "message": "Employee created"}
    except IntegrityError as error:
        conn.rollback()
        raise HTTPException(status_code=409, detail="Employee code or email already exists") from error
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.put("/{employee_id}")
def update_employee(employee_id: int, employee: EmployeeData, admin: dict = Depends(get_current_admin)):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _ensure_department(cur, employee.department_id)
            cur.execute("""
                UPDATE employees SET employee_code=%s, full_name=%s, email=%s,
                department_id=%s, designation=%s, joining_date=%s, employment_status=%s,
                updated_at=NOW()
                WHERE id=%s RETURNING id
            """, (*_values(employee), employee_id))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Employee not found")
            write_audit_log(
                cur,
                admin["id"],
                "update",
                "employees",
                employee_id,
                {"employee_code": employee.employee_code},
            )
        conn.commit()
        return {"id": employee_id, "message": "Employee updated"}
    except IntegrityError as error:
        conn.rollback()
        raise HTTPException(status_code=409, detail="Employee code or email already exists") from error
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
