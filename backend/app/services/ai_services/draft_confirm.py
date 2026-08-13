import json
import re
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.ai_model import AiMessage
from app.models.user_model import User
from app.repositories import ai_repository
from app.schemas.sprint_schema import SprintCreate
from app.services import sprint_service
from app.services.ai_services.tools.action_tools import (
    execute_create_tasks,
    execute_update_sprint_statuses,
)

_PENDING_FENCE_RE = r"```{fence}(?!_(?:confirmed|rejected))\b"


def _pending_fence_pattern(fence: str) -> str:
    return _PENDING_FENCE_RE.format(fence=re.escape(fence))


def get_owned_message(db: Session, user_id: int, message_id: int) -> AiMessage:
    message = ai_repository.get_message_by_id(db, message_id)
    if not message:
        raise ValueError("Không tìm thấy tin nhắn bản nháp.")
    session = ai_repository.get_session_by_id_and_user(db, message.conversation_id, user_id)
    if not session:
        raise ValueError("Bạn không sở hữu bản nháp này.")
    return message


def extract_draft_payload(content: str, fence: str) -> list[dict[str, Any]]:
    if re.search(rf"```{re.escape(fence)}_confirmed\b", content):
        raise ValueError("Bản nháp này đã được xác nhận.")
    if re.search(rf"```{re.escape(fence)}_rejected\b", content):
        raise ValueError("Bản nháp này đã bị từ chối.")

    match = re.search(
        rf"{_pending_fence_pattern(fence)}\s*(.*?)\s*```",
        content,
        re.DOTALL,
    )
    if not match:
        raise ValueError("Không tìm thấy bản nháp hợp lệ trong tin nhắn.")

    raw = match.group(1).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("Bản nháp không phải JSON hợp lệ.") from exc

    if isinstance(data, dict):
        if isinstance(data.get("tasks"), list):
            data = data["tasks"]
        elif isinstance(data.get("sprints"), list):
            data = data["sprints"]
        else:
            data = [data]
    if not isinstance(data, list):
        raise ValueError("Bản nháp không đúng định dạng danh sách.")
    return [item for item in data if isinstance(item, dict)]


def set_draft_message_status(
    db: Session,
    message: AiMessage,
    fence: str,
    status: str,
    *,
    commit: bool = True,
) -> bool:
    updated, count = re.subn(
        _pending_fence_pattern(fence),
        f"```{fence}_{status}",
        message.content,
        count=1,
    )
    if count == 0:
        return False
    message.content = updated
    if commit:
        db.commit()
    return True


def update_draft_payload(
    db: Session,
    current_user: User,
    message_id: int,
    fence: str,
    payload: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if fence not in {"json_task_draft", "json_sprint_draft"}:
        raise ValueError("Loại bản nháp không hỗ trợ chỉnh sửa.")
    if not payload:
        raise ValueError("Bản nháp phải có ít nhất một mục.")

    message = get_owned_message(db, current_user.id, message_id)
    original = extract_draft_payload(message.content, fence)
    normalized = _preserve_draft_project_ids(original, payload, fence)
    serialized = json.dumps(normalized, ensure_ascii=False, indent=2)
    updated, count = re.subn(
        rf"({_pending_fence_pattern(fence)}\s*).*?(\s*```)",
        lambda match: f"{match.group(1)}{serialized}{match.group(2)}",
        message.content,
        count=1,
        flags=re.DOTALL,
    )
    if count == 0:
        raise ValueError("Không thể cập nhật bản nháp đã xác nhận hoặc bị từ chối.")

    message.content = updated
    db.commit()
    return normalized


def _preserve_draft_project_ids(
    original: list[dict[str, Any]],
    edited: list[dict[str, Any]],
    fence: str,
) -> list[dict[str, Any]]:
    if len(original) != len(edited):
        raise ValueError("Không được thêm hoặc xóa mục bằng trình chỉnh sửa bản nháp.")

    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(edited):
        if not isinstance(item, dict):
            raise ValueError("Dữ liệu bản nháp không hợp lệ.")
        source = original[index]
        next_item = dict(item)
        if source.get("project_id") is not None:
            next_item["project_id"] = source["project_id"]
        else:
            next_item.pop("project_id", None)

        if fence == "json_task_draft":
            source_children = source.get("subtasks")
            edited_children = next_item.get("subtasks")
            if isinstance(source_children, list):
                if not isinstance(edited_children, list):
                    raise ValueError("Không được thay đổi cấu trúc cây task trong trình chỉnh sửa.")
                next_item["subtasks"] = _preserve_draft_project_ids(
                    source_children, edited_children, fence
                )
            elif edited_children:
                raise ValueError("Không được thêm cây task ngoài cấu trúc bản nháp.")
        normalized.append(next_item)
    return normalized


def filter_rejected_tasks(
    tasks: list[dict[str, Any]],
    rejected_paths: set[str],
    current_path: list[int] | None = None,
) -> list[dict[str, Any]]:
    current_path = current_path or []
    kept: list[dict[str, Any]] = []
    for index, task in enumerate(tasks):
        path = [*current_path, index]
        ancestors = {"-".join(str(part) for part in path[:idx + 1]) for idx in range(len(path))}
        if ancestors & rejected_paths:
            continue
        next_task = dict(task)
        subtasks = next_task.get("subtasks")
        if isinstance(subtasks, list) and subtasks:
            next_task["subtasks"] = filter_rejected_tasks(subtasks, rejected_paths, path)
            if not next_task["subtasks"]:
                next_task.pop("subtasks", None)
        kept.append(next_task)
    return kept


def confirm_tasks_from_message(
    db: Session,
    current_user: User,
    message_id: int,
    project_id: int | None = None,
    rejected_paths: list[str] | None = None,
) -> list[int]:
    message = get_owned_message(db, current_user.id, message_id)
    tasks_data = extract_draft_payload(message.content, "json_task_draft")
    if rejected_paths:
        tasks_data = filter_rejected_tasks(tasks_data, set(rejected_paths))
    if not tasks_data:
        raise ValueError("Không còn task nào trong bản nháp để tạo.")

    set_draft_message_status(db, message, "json_task_draft", "confirmed", commit=False)
    try:
        created_tasks = execute_create_tasks(
            db=db,
            current_user=current_user,
            project_id=project_id,
            tasks_data=tasks_data,
        )
    except Exception:
        db.rollback()
        raise
    return [task.id for task in created_tasks]


def confirm_sprints_from_message(
    db: Session,
    current_user: User,
    message_id: int,
    project_id: int | None = None,
) -> list[int]:
    message = get_owned_message(db, current_user.id, message_id)
    sprints_data = extract_draft_payload(message.content, "json_sprint_draft")
    if not sprints_data:
        raise ValueError("Không tìm thấy sprint trong bản nháp.")

    set_draft_message_status(db, message, "json_sprint_draft", "confirmed", commit=False)
    created_ids: list[int] = []
    try:
        for draft in sprints_data:
            pid = draft.get("project_id") or project_id
            if not pid:
                raise ValueError(f"Bản nháp sprint '{draft.get('name')}' thiếu project_id.")

            start_date = _parse_date(draft.get("start_date"))
            end_date = _parse_date(draft.get("end_date"))
            if not start_date or not end_date:
                raise ValueError(f"Bản nháp sprint '{draft.get('name')}' thiếu ngày bắt đầu/kết thúc.")

            name = str(draft.get("name") or "").strip()
            if not name:
                raise ValueError("Bản nháp sprint thiếu tên.")

            sprint_in = SprintCreate(
                name=name,
                goal=draft.get("goal"),
                start_date=start_date,
                end_date=end_date,
                status="planned",
            )
            sprint = sprint_service.create_sprint(db, int(pid), current_user.id, sprint_in)
            created_ids.append(sprint.id)
    except Exception:
        db.rollback()
        raise
    return created_ids


def confirm_sprint_status_from_message(
    db: Session,
    current_user: User,
    message_id: int,
) -> list[dict[str, Any]]:
    message = get_owned_message(db, current_user.id, message_id)
    updates = extract_draft_payload(message.content, "json_sprint_status_draft")
    if not updates:
        raise ValueError("Không tìm thấy đề xuất đổi trạng thái sprint.")

    set_draft_message_status(db, message, "json_sprint_status_draft", "confirmed", commit=False)
    try:
        return execute_update_sprint_statuses(db, current_user, updates)
    except Exception:
        db.rollback()
        raise


def reject_draft_from_message(
    db: Session,
    current_user: User,
    message_id: int,
    fence: str,
) -> None:
    allowed = {"json_task_draft", "json_sprint_draft", "json_sprint_status_draft"}
    if fence not in allowed:
        raise ValueError("Loại bản nháp không hợp lệ.")
    message = get_owned_message(db, current_user.id, message_id)
    extract_draft_payload(message.content, fence)
    if not set_draft_message_status(db, message, fence, "rejected"):
        raise ValueError("Không thể từ chối bản nháp này.")


def _parse_date(value: Any):
    if value is None:
        return None
    if hasattr(value, "year") and hasattr(value, "month"):
        return value
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    return None
