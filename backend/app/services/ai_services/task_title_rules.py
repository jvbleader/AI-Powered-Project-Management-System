import re
from typing import Any

_PLACEHOLDER_TITLE_PATTERNS = (
    re.compile(
        r"^(?:task|subtask|sub-subtask|story|item|epic|công việc|hạng mục|chức năng|tính năng|feature|function|module)"
        r"\s*(?:[#:]?\s*\d+(?:[._-]\d+)*)?$"
    ),
    re.compile(r"^(?:phần|part)\s*\d+(?:[._-]\d+)*$"),
    re.compile(r"^(?:epic/task cha|task cha|task lá|parent task|child task|root task)$"),
)
_PLACEHOLDER_FRAGMENTS = (
    "subtask",
    "sub-subtask",
    "cần chia nhỏ",
    "task lá",
    "task cha",
)
_TRAILING_PART_PATTERN = re.compile(r"(?:\(|\b)(?:phần|part)\s*\d+(?:[._-]\d+)*\)?$")


def normalize_task_title(title: Any) -> str:
    return re.sub(r"\s+", " ", str(title or "")).strip()


def is_meaningful_task_title(title: Any) -> bool:
    normalized = normalize_task_title(title)
    if not normalized:
        return False

    folded = normalized.casefold()

    if any(fragment in folded for fragment in _PLACEHOLDER_FRAGMENTS):
        return False

    if any(pattern.fullmatch(folded) for pattern in _PLACEHOLDER_TITLE_PATTERNS):
        return False

    if _TRAILING_PART_PATTERN.search(folded):
        return False

    return True


def find_non_meaningful_task_titles(
    tasks_data: list[dict[str, Any]], parent_path: str = ""
) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []

    for index, task_data in enumerate(tasks_data, start=1):
        path = f"{parent_path}.{index}" if parent_path else str(index)
        title = normalize_task_title(task_data.get("title"))

        if not is_meaningful_task_title(title):
            issues.append({"path": path, "title": title or "(trống)"})

        subtasks = task_data.get("subtasks")
        if isinstance(subtasks, list) and subtasks:
            issues.extend(find_non_meaningful_task_titles(subtasks, path))

    return issues


def format_task_title_issues(issues: list[dict[str, str]], limit: int = 5) -> str:
    preview = issues[:limit]
    lines = [f'- Task {issue["path"]}: "{issue["title"]}"' for issue in preview]
    if len(issues) > limit:
        lines.append(f"- ... và {len(issues) - limit} task khác")
    return "\n".join(lines)


def validate_meaningful_task_titles(tasks_data: list[dict[str, Any]]) -> None:
    issues = find_non_meaningful_task_titles(tasks_data)
    if not issues:
        return

    issue_text = format_task_title_issues(issues)
    raise ValueError(
        "Một số task có tiêu đề quá chung chung hoặc mang tính placeholder:\n"
        f"{issue_text}\n"
        'Hãy đặt lại tên theo đúng ngữ cảnh nghiệp vụ/kết quả cần đạt, ví dụ: '
        '"Xử lý webhook cập nhật trạng thái đơn hàng" thay vì "Task 1" hoặc "Phần 1".'
    )
