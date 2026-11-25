from datetime import date, time
from typing import Literal

from pydantic import BaseModel, Field, model_validator

DurationType = Literal["full_day", "first_half", "second_half", "custom_hours"]
LeaveStatus = Literal["planned", "taken"]


class LeaveDateInput(BaseModel):
    leave_date: date
    duration_type: DurationType = "full_day"
    start_time: time | None = None
    end_time: time | None = None


class LeaveCreate(BaseModel):
    employee_id: int
    leave_type_id: int
    leave_date: date
    duration_type: DurationType = "full_day"
    start_time: time | None = None
    end_time: time | None = None
    status: LeaveStatus = "taken"
    reason: str | None = None
    admin_remarks: str | None = None


class LeaveBatchCreate(BaseModel):
    employee_id: int
    leave_type_id: int
    dates: list[LeaveDateInput] = Field(min_length=1, max_length=62)
    status: LeaveStatus = "taken"
    reason: str | None = None
    admin_remarks: str | None = None

    @model_validator(mode="after")
    def dates_must_be_unique(self):
        date_values = [item.leave_date for item in self.dates]
        if len(date_values) != len(set(date_values)):
            raise ValueError("Each leave date must be unique")
        return self


class LeaveUpdate(BaseModel):
    employee_id: int
    leave_type_id: int
    leave_date: date
    duration_type: DurationType
    start_time: time | None = None
    end_time: time | None = None
    status: LeaveStatus
    reason: str | None = None
    admin_remarks: str | None = None
