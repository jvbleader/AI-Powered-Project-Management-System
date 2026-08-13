import json
import re
from typing import Any


def _extract_task_draft_block(text: str) -> tuple[str, list[dict[str, Any]]] | None:
    normalized = text.replace("json_task_draft_confirmed", "json_task_draft").replace(
        "json_task_draft_rejected", "json_task_draft"
    )
    match = re.search(r"```json_task_draft\s*(.*?)\s*```", normalized, re.DOTALL)
    if not match:
        return None
    json_str = match.group(1).strip()
    try:
        tasks = json.loads(json_str)
        if isinstance(tasks, dict):
            if isinstance(tasks.get("tasks"), list):
                tasks = tasks["tasks"]
            else:
                tasks = [tasks]
        if not isinstance(tasks, list):
            return None
        return json_str, tasks
    except Exception:
        return None


def _count_task_nodes(tasks: list[dict[str, Any]]) -> int:
    total = 0
    for task in tasks:
        total += 1
        subtasks = task.get("subtasks") or []
        if isinstance(subtasks, list) and subtasks:
            total += _count_task_nodes(subtasks)
    return total


def _has_subtasks(tasks: list[dict[str, Any]]) -> bool:
    for task in tasks:
        subtasks = task.get("subtasks") or []
        if isinstance(subtasks, list) and subtasks:
            return True
    return False


def _collect_assignee_map(tasks: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    assignees: dict[str, dict[str, Any]] = {}

    def walk(task_list: list[dict[str, Any]]) -> None:
        for task in task_list:
            title = (task.get("title") or "").strip().lower()
            if title:
                payload: dict[str, Any] = {}
                for key in ("assignee_id", "assignee_name", "assignee_ids"):
                    if task.get(key) is not None:
                        payload[key] = task.get(key)
                if payload:
                    assignees[title] = payload
            subtasks = task.get("subtasks") or []
            if isinstance(subtasks, list) and subtasks:
                walk(subtasks)

    walk(tasks)
    return assignees


def _apply_assignee_map(tasks: list[dict[str, Any]], assignees: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for task in tasks:
        new_task = dict(task)
        title = (task.get("title") or "").strip().lower()
        donor = assignees.get(title)
        if donor:
            for key, value in donor.items():
                new_task[key] = value
        subtasks = task.get("subtasks") or []
        if isinstance(subtasks, list) and subtasks:
            new_task["subtasks"] = _apply_assignee_map(subtasks, assignees)
        merged.append(new_task)
    return merged


_ASSIGNEE_FIELDS = ("assignee_id", "assignee_ids", "assignee_name")


def normalize_task_draft_for_project_types(
    output_str: str,
    project_type_map: dict[int, str],
    default_project_id: int | None = None,
) -> str:
    """Ép draft Agile thành danh sách phẳng và luôn để trống người thực hiện."""
    current_block = _extract_task_draft_block(output_str)
    if not current_block:
        return output_str

    current_json_str, tasks = current_block

    def project_type_for(project_id: Any) -> str:
        try:
            normalized_id = int(project_id)
        except (TypeError, ValueError):
            normalized_id = default_project_id
        return (project_type_map.get(normalized_id, "") or "").strip().lower()

    def normalize(
        task_list: list[dict[str, Any]],
        inherited_project_id: int | None = None,
    ) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for task in task_list:
            next_task = dict(task)
            task_project_id = next_task.get("project_id") or inherited_project_id or default_project_id
            project_type = project_type_for(task_project_id)
            children = next_task.get("subtasks")

            if project_type == "agile":
                for field in _ASSIGNEE_FIELDS:
                    next_task.pop(field, None)
                if isinstance(children, list) and children:
                    normalized.extend(normalize(children, task_project_id))
                    continue
                next_task.pop("subtasks", None)
            elif isinstance(children, list) and children:
                next_task["subtasks"] = normalize(children, task_project_id)

            if task_project_id is not None and next_task.get("project_id") is None:
                next_task["project_id"] = task_project_id
            normalized.append(next_task)
        return normalized

    normalized_tasks = normalize(tasks)
    normalized_json = json.dumps(normalized_tasks, ensure_ascii=False, indent=2)
    return output_str.replace(current_json_str, normalized_json)


def _structure_regressed(base_tasks: list[dict[str, Any]], candidate_tasks: list[dict[str, Any]]) -> bool:
    base_nodes = _count_task_nodes(base_tasks)
    candidate_nodes = _count_task_nodes(candidate_tasks)
    base_tree = _has_subtasks(base_tasks)
    candidate_tree = _has_subtasks(candidate_tasks)

    if base_tree and not candidate_tree and base_nodes > candidate_nodes:
        return True

    if base_nodes >= 3 and candidate_nodes < base_nodes - 1:
        return True

    if len(base_tasks) != len(candidate_tasks) and base_tree and candidate_tree:
        return True

    return False


def preserve_task_draft_structure(output_str: str, history_messages: list[Any]) -> str:
    previous_tasks: list[dict[str, Any]] | None = None
    for message in reversed(history_messages[:-1] if len(history_messages) > 1 else []):
        content = getattr(message, "content", "") or ""
        block = _extract_task_draft_block(content)
        if block:
            _, previous_tasks = block
            break

    if not previous_tasks:
        return output_str

    current_block = _extract_task_draft_block(output_str)
    if not current_block:
        return output_str

    current_json_str, current_tasks = current_block
    if not _structure_regressed(previous_tasks, current_tasks):
        return output_str

    assignee_map = _collect_assignee_map(current_tasks)
    if not assignee_map:
        return output_str

    merged_tasks = _apply_assignee_map(previous_tasks, assignee_map)
    merged_json = json.dumps(merged_tasks, ensure_ascii=False, indent=2)
    return output_str.replace(current_json_str, merged_json)
