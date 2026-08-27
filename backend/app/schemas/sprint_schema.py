from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, field_validator, model_validator


class SprintBase(BaseModel):
    name: str
    goal: Optional[str] = None
    start_date: date
    end_date: date
    status: Optional[str] = "planned"
    review_note: Optional[str] = None


class SprintCreate(SprintBase):
    @field_validator("name", "goal")
    @classmethod
    def validate_required_text(cls, value: str | None, info):
        normalized = (value or "").strip()
        if not normalized:
            label = "Tên sprint" if info.field_name == "name" else "Mục tiêu sprint"
            raise ValueError(f"{label} không được để trống.")
        if info.field_name == "name" and len(normalized) > 255:
            raise ValueError("Tên sprint không được vượt quá 255 ký tự.")
        return normalized

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None):
        normalized = (value or "planned").strip().lower()
        if normalized == "planning":
            normalized = "planned"
        if normalized not in {"planned", "active"}:
            raise ValueError("Sprint mới chỉ có thể ở trạng thái planned hoặc active.")
        return normalized

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.end_date < self.start_date:
            raise ValueError("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.")
        return self


class SprintUpdate(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None
    review_note: Optional[str] = None

    @field_validator("name", "goal")
    @classmethod
    def validate_optional_text(cls, value: str | None, info):
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            label = "Tên sprint" if info.field_name == "name" else "Mục tiêu sprint"
            raise ValueError(f"{label} không được để trống.")
        if info.field_name == "name" and len(normalized) > 255:
            raise ValueError("Tên sprint không được vượt quá 255 ký tự.")
        return normalized

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None):
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized == "planning":
            normalized = "planned"
        if normalized not in {"planned", "active", "closed"}:
            raise ValueError("Trạng thái sprint không hợp lệ.")
        return normalized

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.start_date is not None and self.end_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.")
        return self


class SprintResponse(SprintBase):
    id: int
    project_id: int
    created_by_member_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
