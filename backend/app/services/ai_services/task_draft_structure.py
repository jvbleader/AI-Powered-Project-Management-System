import json
import re
import unicodedata
from collections import Counter
from typing import Any

from app.services.ai_services.task_title_rules import (
    is_single_story_request,
    normalize_task_title,
    sanitize_placeholder_tasks,
    strip_placeholder_part_suffix,
)


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
        elif isinstance(tasks, list) and len(tasks) == 1 and isinstance(tasks[0], dict) and isinstance(tasks[0].get("tasks"), list):
            tasks = tasks[0]["tasks"]

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
_PRIORITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}
_TITLE_STOPWORDS = {
    "và",
    "cua",
    "của",
    "cho",
    "vào",
    "vao",
    "cac",
    "các",
    "mot",
    "một",
    "the",
    "and",
    "for",
    "with",
    "he",
    "thong",
    "thống",
    "xu",
    "xử",
    "ly",
    "lý",
    "thiet",
    "thiết",
    "ke",
    "kế",
}


def _project_id_of(task: dict[str, Any], inherited: int | None) -> int | None:
    raw = task.get("project_id") if task.get("project_id") is not None else inherited
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return inherited


def _estimated_hours(task: dict[str, Any]) -> float:
    children = task.get("subtasks")
    if isinstance(children, list) and children:
        return round(sum(_estimated_hours(child) for child in children), 1)
    try:
        return float(task.get("estimated_hours") or 0)
    except (TypeError, ValueError):
        return 0.0


def _collect_dates(tasks: list[dict[str, Any]], key: str) -> list[str]:
    values: list[str] = []
    for task in tasks:
        value = task.get(key)
        if value:
            values.append(str(value))
        children = task.get("subtasks")
        if isinstance(children, list) and children:
            values.extend(_collect_dates(children, key))
    return values


def _highest_priority(tasks: list[dict[str, Any]]) -> str | None:
    best = None
    best_rank = -1
    stack = list(tasks)
    while stack:
        task = stack.pop()
        priority = str(task.get("priority") or "").strip().lower()
        rank = _PRIORITY_RANK.get(priority, -1)
        if rank > best_rank:
            best = priority
            best_rank = rank
        children = task.get("subtasks")
        if isinstance(children, list) and children:
            stack.extend(children)
    return best


def _extract_parent_title_from_prompt(prompt: str | None) -> str | None:
    if not prompt:
        return None

    text = prompt.strip()
    if ":" in text:
        prefix = text.split(":", 1)[0].strip()
    else:
        prefix = text

    cleaned = re.sub(
        r"\s+(?:trong|ở|thuộc|vào)\s+dự\s*án\s+[A-Za-zÀ-ỹ0-9_\-\s]+",
        "",
        prefix,
        flags=re.IGNORECASE,
    ).strip()

    match = re.search(
        r"(?:tạo|xây\s*dựng|phát\s*triển|triển\s*khai|làm|lên\s*kế\s*hoạch\s*cho|phân\s*rã)?\s*(?:toàn\s*bộ\s+)?((?:module|hệ\s*thống|phân\s*hệ|tính\s*năng|chức\s*năng|quy\s*trình)\s+[A-Za-zÀ-ỹ0-9_\-\s]+)",
        cleaned,
        flags=re.IGNORECASE,
    )
    if match:
        raw_name = match.group(1).strip()
        words = raw_name.split()
        if len(words) >= 2:
            first_word = words[0].capitalize()
            rest = " ".join(words[1:])
            return f"{first_word} {rest}"
        return raw_name.capitalize()

    match_general = re.search(
        r"^(?:tạo|xây\s*dựng|phát\s*triển|triển\s*khai|làm)\s+(.+)$",
        cleaned,
        flags=re.IGNORECASE,
    )
    if match_general:
        target = match_general.group(1).strip()
        if len(target) >= 3 and not target.lower().startswith(("1 task", "một task", "task")):
            return f"Phát triển {target}"

    return None


def _synthesize_parent_title(
    tasks: list[dict[str, Any]],
    latest_preview: str | None = None,
) -> str:
    from_prompt = _extract_parent_title_from_prompt(latest_preview)
    if from_prompt:
        return from_prompt

    titles = [(task.get("title") or "").strip() for task in tasks if (task.get("title") or "").strip()]
    if not titles:
        return "Kế hoạch triển khai"
    token_counts: Counter[str] = Counter()
    for title in titles:
        tokens = {
            token
            for token in re.findall(r"[A-Za-zÀ-ỹ0-9]+", title.lower())
            if token not in _TITLE_STOPWORDS and len(token) >= 3
        }
        token_counts.update(tokens)
    min_count = max(2, (len(titles) + 1) // 2)
    common = {token for token, count in token_counts.items() if count >= min_count}
    ordered: list[str] = []
    seen: set[str] = set()
    for title in titles:
        for word in re.findall(r"[A-Za-zÀ-ỹ0-9]+", title):
            token = word.lower()
            if token in common and token not in seen:
                seen.add(token)
                ordered.append(word)
            if len(ordered) >= 3:
                break
        if len(ordered) >= 3:
            break
    if ordered:
        return f"Triển khai {' '.join(ordered)}"
    if len(titles) > 1:
        return f"Phát triển các hạng mục: {', '.join(titles[:2])}"
    return titles[0]


def _make_wbs_parent(
    children: list[dict[str, Any]],
    project_id: int | None,
    latest_preview: str | None = None,
) -> dict[str, Any]:
    starts = _collect_dates(children, "start_date")
    ends = _collect_dates(children, "deadline")
    parent_title = _synthesize_parent_title(children, latest_preview)
    parent: dict[str, Any] = {
        "title": parent_title,
        "description": {
            "objective": f"Điều phối và hoàn thành toàn bộ các hạng mục con trong WBS cho {parent_title}.",
            "criteria": "Mọi task con phải có đầu ra nghiệm thu được và hoàn thành đúng hạn.",
            "implementation": "Thực hiện các subtasks theo cấu trúc cây; task cha chỉ đóng khi mọi nhánh con xong.",
            "output": "Toàn bộ hạng mục con được hoàn thành và nghiệm thu.",
            "acceptance_criteria": [
                "Mọi task lá trong cây đã đạt tiêu chí chấp nhận.",
                "Lịch task cha khớp ngày sớm nhất / muộn nhất của các con.",
            ],
        },
        "priority": _highest_priority(children) or "high",
        "estimated_hours": round(sum(_estimated_hours(child) for child in children), 1),
        "subtasks": children,
        "type": "task",
    }
    if project_id is not None:
        parent["project_id"] = project_id
    if starts:
        parent["start_date"] = min(starts)
    if ends:
        parent["deadline"] = max(ends)
    return parent


def _sync_parent_estimates(task: dict[str, Any]) -> dict[str, Any]:
    next_task = dict(task)
    children = next_task.get("subtasks")
    if isinstance(children, list) and children:
        synced_children = [_sync_parent_estimates(child) for child in children]
        next_task["subtasks"] = synced_children
        next_task["estimated_hours"] = round(sum(_estimated_hours(child) for child in synced_children), 1)
    return next_task


def sync_task_draft_rollups(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Đồng bộ ET task cha = tổng ET mọi task con sau khi draft đã được chuẩn hóa."""
    return [_sync_parent_estimates(task) for task in tasks]


def _group_tasks_by_project(
    tasks: list[dict[str, Any]],
    default_project_id: int | None,
) -> list[tuple[int | None, list[dict[str, Any]]]]:
    grouped: dict[int | None, list[dict[str, Any]]] = {}
    order: list[int | None] = []
    for task in tasks:
        project_id = _project_id_of(task, default_project_id)
        if project_id not in grouped:
            grouped[project_id] = []
            order.append(project_id)
        grouped[project_id].append(task)
    return [(project_id, grouped[project_id]) for project_id in order]


def _is_explicit_multi_tasks_request(prompt: str | None) -> bool:
    if not prompt:
        return False
    normalized = prompt.strip().lower()
    return bool(re.search(
        r"\b(?:tạo|thêm|giao|lập)\s+(?:\d+|hai|ba|bốn|năm|2|3|4|5|nhiều|các|danh\s*sách)\s+(?:tasks?|công\s*việc|nhiệm\s*vụ)\b",
        normalized,
    ))


def waterfall_roots_need_wrap(
    tasks: list[dict[str, Any]],
    project_type_map: dict[int, str],
    default_project_id: int | None = None,
    latest_preview: str | None = None,
) -> bool:
    if _is_explicit_multi_tasks_request(latest_preview):
        return False
    for project_id, group in _group_tasks_by_project(tasks, default_project_id):
        project_type = (project_type_map.get(project_id, "") or "").strip().lower()
        has_existing_parent = all(bool(t.get("parent_task_id")) for t in group)
        if project_type == "waterfall" and len(group) > 1 and not has_existing_parent:
            return True
    return False


def _ensure_waterfall_root_tree(
    tasks: list[dict[str, Any]],
    project_type_map: dict[int, str],
    default_project_id: int | None,
    latest_preview: str | None = None,
) -> list[dict[str, Any]]:
    if _is_explicit_multi_tasks_request(latest_preview):
        return tasks
    wrapped: list[dict[str, Any]] = []
    for project_id, group in _group_tasks_by_project(tasks, default_project_id):
        project_type = (project_type_map.get(project_id, "") or "").strip().lower()
        has_existing_parent = all(bool(t.get("parent_task_id")) for t in group)
        if project_type == "waterfall" and len(group) > 1 and not has_existing_parent:
            wrapped.append(_make_wbs_parent(group, project_id, latest_preview))
        else:
            wrapped.extend(group)
    return wrapped


def collect_task_draft_project_ids(
    output_str: str,
    default_project_id: int | None = None,
) -> list[int]:
    block = _extract_task_draft_block(output_str)
    if not block:
        return []
    _, tasks = block
    found: list[int] = []

    def walk(task_list: list[dict[str, Any]], inherited: int | None) -> None:
        for task in task_list:
            project_id = _project_id_of(task, inherited)
            if project_id is not None and project_id not in found:
                found.append(project_id)
            children = task.get("subtasks")
            if isinstance(children, list) and children:
                walk(children, project_id)

    walk(tasks, default_project_id)
    return found


def _has_assignee(task: dict[str, Any]) -> bool:
    if task.get("assignee_id"):
        return True
    ids = task.get("assignee_ids")
    return isinstance(ids, list) and any(ids)


def _parse_assignee_ids(task: dict[str, Any]) -> list[int]:
    values: list[Any] = []
    raw_ids = task.get("assignee_ids")
    if isinstance(raw_ids, list):
        values.extend(raw_ids)
    if task.get("assignee_id") is not None:
        values.append(task.get("assignee_id"))
    parsed: list[int] = []
    for value in values:
        try:
            user_id = int(value)
        except (TypeError, ValueError):
            continue
        if user_id > 0 and user_id not in parsed:
            parsed.append(user_id)
    return parsed


def _clear_assignees(task: dict[str, Any]) -> None:
    for field in _ASSIGNEE_FIELDS:
        task.pop(field, None)


def _fold_text(value: Any) -> str:
    text = " ".join(str(value or "").strip().casefold().split())
    if not text:
        return ""
    normalized = unicodedata.normalize("NFD", text)
    stripped = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return stripped.replace("đ", "d")


def _fold_person_name(value: Any) -> str:
    return _fold_text(value)


def _task_signal_text(task: dict[str, Any]) -> str:
    parts = [str(task.get("title") or "")]
    description = task.get("description")
    if isinstance(description, dict):
        parts.extend(str(value) for value in description.values())
    elif description:
        parts.append(str(description))
    return _fold_text(" ".join(parts))


def _prefers_lead_owner(task: dict[str, Any]) -> bool:
    text = _task_signal_text(task)
    lead_keywords = (
        "khao sat",
        "yeu cau",
        "phan tich",
        "thiet ke",
        "kien truc",
        "ke hoach",
        "dinh nghia",
        "phe duyet",
        "nghiem thu",
    )
    return any(keyword in text for keyword in lead_keywords)


def _desired_assignee_count(task: dict[str, Any], hours: float) -> int:
    priority = str(task.get("priority") or "").strip().lower()
    if hours >= 8:
        return 2
    if hours >= 6 and priority in {"high", "critical"}:
        return 2
    return 1


def _role_penalty(role: str | None) -> int:
    text = (role or "").strip().lower()
    if any(token in text for token in ("viewer", "view only", "quan sat", "quan sát")):
        return 80
    if any(token in text for token in ("giám đốc", "giam doc", "director", "admin")):
        return 40
    if any(token in text for token in ("manager", "product owner", "po")):
        return 20
    if any(
        token in text
        for token in (
            "lập trình",
            "lap trinh",
            "developer",
            "dev",
            "qa",
            "tester",
            "kỹ sư",
            "ky su",
            "engineer",
            "leader",
        )
    ):
        return 0
    return 10


def _is_lead_role(role: str | None) -> bool:
    text = (role or "").strip().lower()
    return any(token in text for token in ("leader", "manager", "product owner", "po"))


def _windows_overlap(start_a: str | None, end_a: str | None, start_b: str | None, end_b: str | None) -> bool:
    if not start_a or not end_a or not start_b or not end_b:
        return False
    return start_a <= end_b and start_b <= end_a


def _member_overlaps(
    member: dict[str, Any],
    start_date: str | None,
    deadline: str | None,
    extra_windows: list[tuple[str | None, str | None]],
) -> bool:
    for window in member.get("busy_windows") or []:
        if _windows_overlap(start_date, deadline, window.get("start_date"), window.get("deadline")):
            return True
    for extra_start, extra_end in extra_windows:
        if _windows_overlap(start_date, deadline, extra_start, extra_end):
            return True
    return False


def _pick_members(
    team: list[dict[str, Any]],
    count: int,
    start_date: str | None,
    deadline: str | None,
    extra_hours: dict[int, float],
    extra_windows: dict[int, list[tuple[str | None, str | None]]],
    exclude: set[int] | None = None,
    prefer_leads: bool = False,
) -> list[dict[str, Any]]:
    excluded = exclude or set()
    pool = [member for member in team if member.get("user_id") not in excluded]
    if prefer_leads:
        leads = [member for member in pool if _is_lead_role(member.get("role"))]
        if leads:
            pool = leads
    if not pool:
        pool = list(team)

    def sort_key(member: dict[str, Any]) -> tuple[int, int, float, int]:
        user_id = int(member.get("user_id") or 0)
        overlap = 1 if _member_overlaps(member, start_date, deadline, extra_windows.get(user_id, [])) else 0
        hours = float(member.get("open_estimated_hours") or 0) + extra_hours.get(user_id, 0)
        return (
            overlap,
            _role_penalty(member.get("role")),
            hours,
            int(member.get("active_tasks_count") or 0),
        )

    ranked = sorted(pool, key=sort_key)
    return ranked[: max(1, count)] if ranked else []


def _apply_assignees(task: dict[str, Any], people: list[dict[str, Any]]) -> None:
    if not people:
        return
    ids = [int(person["user_id"]) for person in people if person.get("user_id")]
    names = [str(person.get("name") or "").strip() for person in people]
    names = [name for name in names if name]
    if not ids:
        return
    task["assignee_id"] = ids[0]
    task["assignee_ids"] = ids
    if names:
        task["assignee_name"] = ", ".join(names)


def _resolve_named_assignees(task: dict[str, Any], team_by_id: dict[int, dict[str, Any]]) -> None:
    ids = [user_id for user_id in _parse_assignee_ids(task) if user_id in team_by_id]

    if not ids and task.get("assignee_name"):
        team_ids_by_name: dict[str, int] = {}
        for member in team_by_id.values():
            folded_name = _fold_person_name(member.get("name") or member.get("userName"))
            if folded_name and folded_name not in team_ids_by_name:
                team_ids_by_name[folded_name] = int(member["user_id"])

        for raw_name in str(task["assignee_name"]).split(","):
            folded_name = _fold_person_name(raw_name)
            if not folded_name:
                continue
            user_id = team_ids_by_name.get(folded_name)
            if user_id and user_id not in ids:
                ids.append(user_id)

    _clear_assignees(task)
    if not ids:
        return
    people = [team_by_id[user_id] for user_id in ids]
    _apply_assignees(task, people)


def _assign_waterfall_tasks(
    tasks: list[dict[str, Any]],
    team: list[dict[str, Any]],
    extra_hours: dict[int, float],
    extra_windows: dict[int, list[tuple[str | None, str | None]]],
    allow_auto_assign: bool = True,
    requested_assignees: list[str] | None = None,
) -> None:
    team_by_id = {int(member["user_id"]): member for member in team if member.get("user_id")}

    requested_people: list[dict[str, Any]] = []
    if requested_assignees:
        team_ids_by_name: dict[str, int] = {}
        for member in team_by_id.values():
            m_name = member.get("name") or member.get("userName") or ""
            folded = _fold_person_name(m_name)
            if folded:
                team_ids_by_name[folded] = int(member["user_id"])
        for req in requested_assignees:
            folded_req = _fold_person_name(req)
            if not folded_req:
                continue
            matched_uid = None
            if folded_req in team_ids_by_name:
                matched_uid = team_ids_by_name[folded_req]
            else:
                for f_name, uid in team_ids_by_name.items():
                    if folded_req in f_name or f_name in folded_req:
                        matched_uid = uid
                        break
            if matched_uid and team_by_id.get(matched_uid):
                matched_person = team_by_id[matched_uid]
                if matched_person not in requested_people:
                    requested_people.append(matched_person)

    def assign(task: dict[str, Any], inherited_assignees: dict[str, Any] = None) -> None:
        children = task.get("subtasks")
        start_date = task.get("start_date")
        deadline = task.get("deadline")
        hours = _estimated_hours(task)

        if not _has_assignee(task) and not task.get("assignee_name") and inherited_assignees:
            for k, v in inherited_assignees.items():
                task[k] = v

        if isinstance(children, list) and children:
            current_assignees = {}
            for field in _ASSIGNEE_FIELDS:
                if task.get(field):
                    current_assignees[field] = task.get(field)

            for child in children:
                assign(child, current_assignees if current_assignees else inherited_assignees)

            for field in _ASSIGNEE_FIELDS:
                task.pop(field, None)
            return

        had_assignee_originally = _has_assignee(task) or bool(task.get("assignee_name"))
        _resolve_named_assignees(task, team_by_id)
        if (allow_auto_assign or had_assignee_originally) and not _has_assignee(task):
            people = _pick_members(
                team,
                _desired_assignee_count(task, hours),
                start_date,
                deadline,
                extra_hours,
                extra_windows,
                prefer_leads=_prefers_lead_owner(task),
            )
            _apply_assignees(task, people)
        if not _has_assignee(task) and requested_people:
            _apply_assignees(task, requested_people)
        if _has_assignee(task):
            for user_id in _parse_assignee_ids(task):
                extra_hours[user_id] = extra_hours.get(user_id, 0) + hours
                extra_windows.setdefault(user_id, []).append((start_date, deadline))
            return

    for task in tasks:
        assign(task)


def _ensure_oversized_tasks_broken_down(
    tasks: list[dict[str, Any]],
    project_type_map: dict[int, str],
    default_project_id: int | None = None,
    is_top_level: bool = True,
    latest_preview: str | None = None,
) -> list[dict[str, Any]]:
    result = []
    is_explicit_multi = _is_explicit_multi_tasks_request(latest_preview)
    for task in tasks:
        task_project_id = _project_id_of(task, default_project_id)
        p_type = project_type_map.get(task_project_id, "waterfall").lower()
        subtasks = task.get("subtasks")

        if isinstance(subtasks, list) and subtasks:
            task["subtasks"] = _ensure_oversized_tasks_broken_down(
                subtasks, project_type_map, default_project_id, is_top_level=False, latest_preview=latest_preview
            )
            result.append(task)
            continue

        hours = _estimated_hours(task)
        title = normalize_task_title(task.get("title"))

        if is_single_story_request(title) or is_explicit_multi:
            if is_single_story_request(title):
                task["estimated_hours"] = min(4.0, max(1.0, hours))
            else:
                task["estimated_hours"] = min(8.0, max(1.0, hours))
            task.pop("subtasks", None)
            assignee_ids = _parse_assignee_ids(task)
            assignee_names = [
                n.strip()
                for n in str(task.get("assignee_name") or task.get("assignee_names") or "").split(",")
                if n.strip()
            ]
            if assignee_names and not task.get("assignee_name"):
                task["assignee_name"] = ", ".join(assignee_names)
            if assignee_ids and not task.get("assignee_ids"):
                task["assignee_ids"] = assignee_ids
                task["assignee_id"] = assignee_ids[0]
            result.append(task)
            continue

        if title.startswith("Xây dựng giao diện và luồng tạo/gửi") or title.startswith("Xây dựng luồng backend, phê duyệt"):
            result.append(task)
            continue

        is_feature_keyword = bool(
            re.search(
                r"\b(quản\s*lý|quản\s*lí|hệ\s*thống|module|phân\s*hệ|quy\s*trình|workflow)\b",
                title,
                flags=re.IGNORECASE,
            )
        )
        is_module_level = bool(
            re.search(
                r"\b(module|phân\s*hệ|hệ\s*thống|quản\s*lý|nhập\s*hàng|xuất\s*hàng|kiểm\s*kê|báo\s*cáo|thanh\s*toán|đơn\s*hàng)\b",
                title,
                flags=re.IGNORECASE,
            )
        )

        should_breakdown = (hours > 8 and not is_single_story_request(title)) or (is_top_level and is_feature_keyword and not subtasks) or (not is_top_level and is_module_level and hours >= 6 and not subtasks)

        if should_breakdown and not subtasks:
            total_hours = max(4.0, hours)
            sub_hours = min(8.0, max(2.0, round(total_hours / 2.0, 1)))
            base_name = strip_placeholder_part_suffix(title)
            feature_subject = re.sub(
                r"^(?:phát\s*triển\s*|xây\s*dựng\s*|triển\s*khai\s*)?(?:quản\s*lý|quản\s*lí|hệ\s*thống|module|phân\s*hệ|tính\s*năng|chức\s*năng)\s*",
                "",
                base_name,
                flags=re.IGNORECASE,
            ).strip()
            if not feature_subject:
                feature_subject = base_name

            assignee_ids = _parse_assignee_ids(task)
            assignee_names = [
                n.strip()
                for n in str(task.get("assignee_name") or task.get("assignee_names") or "").split(",")
                if n.strip()
            ]

            sub1 = {
                "title": f"Xây dựng giao diện và luồng tạo/gửi {feature_subject}",
                "estimated_hours": sub_hours,
                "start_date": task.get("start_date"),
                "deadline": task.get("deadline"),
                "priority": task.get("priority", "medium"),
                "project_id": task_project_id,
                "description": {
                    "objective": f"Cung cấp form giao diện trực quan cho người dùng nhập liệu, gửi yêu cầu và theo dõi thông tin {feature_subject}.",
                    "criteria": "Validate đầy đủ các trường bắt buộc, kiểm tra điều kiện dữ liệu trước khi gửi, xử lý cảnh báo và phản hồi người dùng.",
                    "implementation": "Xây dựng form nhập liệu, tích hợp các component chọn thời gian/danh mục, schema validation phía client và gọi API tạo mới.",
                    "output": f"Giao diện và form nhập liệu hoàn chỉnh cho {feature_subject}.",
                    "acceptance_criteria": [
                        "Form validate chính xác các trường bắt buộc.",
                        "Gửi dữ liệu thành công hiển thị toast thông báo.",
                        "Báo lỗi rõ ràng khi nhập sai hoặc thiếu dữ liệu.",
                    ],
                },
            }

            sub2 = {
                "title": f"Xây dựng luồng backend, phê duyệt và cập nhật trạng thái {feature_subject}",
                "estimated_hours": sub_hours,
                "start_date": task.get("start_date"),
                "deadline": task.get("deadline"),
                "priority": task.get("priority", "medium"),
                "project_id": task_project_id,
                "description": {
                    "objective": f"Phát triển API xử lý nghiệp vụ, hỗ trợ phân quyền quản lý phê duyệt/từ chối và đồng bộ trạng thái {feature_subject}.",
                    "criteria": "Phân quyền chặt chẽ cho cấp quản lý, ghi nhận lịch sử thay đổi trạng thái, đảm bảo an toàn giao dịch dữ liệu.",
                    "implementation": "Phát triển endpoint API xử lý duyệt/từ chối, cập nhật cơ sở dữ liệu và gửi thông báo trạng thái.",
                    "output": f"API xử lý nghiệp vụ và màn hình quản lý trạng thái cho {feature_subject}.",
                    "acceptance_criteria": [
                        "Quản lý có thể lọc danh sách và thực hiện phê duyệt/từ chối.",
                        "Trạng thái được cập nhật realtime chính xác.",
                        "Hệ thống thông báo kết quả xử lý cho các bên liên quan.",
                    ],
                },
            }

            if len(assignee_ids) >= 2:
                sub1["assignee_id"] = assignee_ids[0]
                sub1["assignee_ids"] = [assignee_ids[0]]
                if assignee_names:
                    sub1["assignee_name"] = assignee_names[0]

                sub2["assignee_id"] = assignee_ids[1]
                sub2["assignee_ids"] = [assignee_ids[1]]
                if len(assignee_names) > 1:
                    sub2["assignee_name"] = assignee_names[1]
            elif len(assignee_ids) == 1:
                sub1["assignee_id"] = assignee_ids[0]
                sub1["assignee_ids"] = [assignee_ids[0]]
                sub2["assignee_id"] = assignee_ids[0]
                sub2["assignee_ids"] = [assignee_ids[0]]
                if assignee_names:
                    sub1["assignee_name"] = assignee_names[0]
                    sub2["assignee_name"] = assignee_names[0]
            elif assignee_names:
                sub1["assignee_name"] = assignee_names[0]
                sub2["assignee_name"] = assignee_names[1] if len(assignee_names) > 1 else assignee_names[0]

            if p_type == "waterfall":
                parent = dict(task)
                parent["estimated_hours"] = sub_hours * 2
                parent["subtasks"] = [sub1, sub2]
                for field in _ASSIGNEE_FIELDS:
                    parent.pop(field, None)
                result.append(parent)
            else:
                result.extend([sub1, sub2])
        else:
            assignee_ids = _parse_assignee_ids(task)
            assignee_names = [
                n.strip()
                for n in str(task.get("assignee_name") or task.get("assignee_names") or "").split(",")
                if n.strip()
            ]
            if assignee_names and not task.get("assignee_name"):
                task["assignee_name"] = ", ".join(assignee_names)
            if assignee_ids and not task.get("assignee_ids"):
                task["assignee_ids"] = assignee_ids
                task["assignee_id"] = assignee_ids[0]
            result.append(task)

    return result


def unwrap_existing_parent_tasks(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """If an LLM mistakenly wrapped subtasks having parent_task_id inside their existing parent task,
    unwrap them to only return the subtasks to be created."""
    unwrapped: list[dict[str, Any]] = []
    for t in tasks:
        subtasks = t.get("subtasks") or []
        subtasks_with_parent = [s for s in subtasks if s.get("parent_task_id")]
        if subtasks and len(subtasks_with_parent) == len(subtasks):
            unwrapped.extend(subtasks)
        else:
            unwrapped.append(t)
    return unwrapped


def normalize_task_draft_for_project_types(
    output_str: str,
    project_type_map: dict[int, str],
    default_project_id: int | None = None,
    latest_preview: str | None = None,
) -> str:
    """Flatten Agile subtasks and enforce single-root tree for Waterfall drafts."""
    current_block = _extract_task_draft_block(output_str)
    if not current_block:
        return output_str

    current_json_str, tasks = current_block
    tasks = unwrap_existing_parent_tasks(tasks)

    def normalize(task_list: list[dict[str, Any]], inherited_project_id: int | None = None) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for task in task_list:
            next_task = dict(task)
            task_project_id = _project_id_of(next_task, inherited_project_id or default_project_id)
            project_type = project_type_map.get(task_project_id, "waterfall").lower()
            children = next_task.get("subtasks")

            if project_type == "agile":
                _clear_assignees(next_task)
                if isinstance(children, list) and children:
                    next_task.pop("subtasks", None)
                    if task_project_id is not None and next_task.get("project_id") is None:
                        next_task["project_id"] = task_project_id
                    normalized.append(next_task)
                    normalized.extend(normalize(children, task_project_id))
                    continue
                next_task.pop("subtasks", None)
            elif isinstance(children, list) and children:
                next_task["subtasks"] = normalize(children, task_project_id)
                for field in _ASSIGNEE_FIELDS:
                    next_task.pop(field, None)

            if task_project_id is not None and next_task.get("project_id") is None:
                next_task["project_id"] = task_project_id
            normalized.append(next_task)
        return normalized

    tasks = sanitize_placeholder_tasks(tasks)
    tasks = _ensure_oversized_tasks_broken_down(
        tasks, project_type_map, default_project_id, latest_preview=latest_preview
    )

    normalized_tasks = _ensure_waterfall_root_tree(
        normalize(tasks),
        project_type_map,
        default_project_id,
        latest_preview=latest_preview,
    )
    normalized_tasks = sanitize_placeholder_tasks(normalized_tasks)
    normalized_tasks = _ensure_oversized_tasks_broken_down(
        normalized_tasks, project_type_map, default_project_id, latest_preview=latest_preview
    )
    normalized_tasks = sync_task_draft_rollups(normalized_tasks)
    normalized_tasks = unwrap_existing_parent_tasks(normalized_tasks)
    normalized_json = json.dumps(normalized_tasks, ensure_ascii=False, indent=2)
    return output_str.replace(current_json_str, normalized_json)


def fill_waterfall_draft_assignees(
    output_str: str,
    project_type_map: dict[int, str],
    teams_by_project: dict[int, list[dict[str, Any]]],
    default_project_id: int | None = None,
    allow_auto_assign: bool = True,
    requested_assignees: list[str] | None = None,
) -> str:
    """Gán người cho task lá Waterfall. Task cha không gán riêng — UI lấy hợp người từ các con."""
    current_block = _extract_task_draft_block(output_str)
    if not current_block:
        return output_str

    current_json_str, tasks = current_block
    extra_hours: dict[int, float] = {}
    extra_windows: dict[int, list[tuple[str | None, str | None]]] = {}

    for project_id, group in _group_tasks_by_project(tasks, default_project_id):
        project_type = (project_type_map.get(project_id, "") or "").strip().lower()
        team = teams_by_project.get(project_id or -1) or []
        if project_type == "waterfall" and team:
            _assign_waterfall_tasks(
                group,
                team,
                extra_hours,
                extra_windows,
                allow_auto_assign=allow_auto_assign,
                requested_assignees=requested_assignees,
            )
    rolled_up_tasks = unwrap_existing_parent_tasks(sync_task_draft_rollups(tasks))
    filled_json = json.dumps(rolled_up_tasks, ensure_ascii=False, indent=2)
    return output_str.replace(current_json_str, filled_json)


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


def preserve_task_draft_structure(
    output_str: str,
    history_messages: list[Any],
    *,
    allow_structure_recovery: bool = False,
) -> str:
    """Recover a draft tree only for an explicit assignee-only edit.

    A new task request must never inherit a previous message's task tree, even
    when the new draft happens to contain assignees.
    """
    if not allow_structure_recovery:
        return output_str
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
    merged_json = json.dumps(sync_task_draft_rollups(merged_tasks), ensure_ascii=False, indent=2)
    return output_str.replace(current_json_str, merged_json)
