import re
from typing import Any

_PLACEHOLDER_TITLE_PATTERNS = (
    re.compile(
        r"^(?:task|subtask|sub-subtask|story|item|epic|công việc|hạng mục|chức năng|tính năng|feature|function|module)"
        r"\s*(?:[#:]?\s*\d+(?:[._-]\d+)*)?$",
        flags=re.IGNORECASE,
    ),
    re.compile(r"^(?:phần|part|giai\s*đoạn|phase|đợt|bước|step|chặng)\s*\d+(?:[._-]\d+)*$", flags=re.IGNORECASE),
    re.compile(r"^(?:epic/task cha|task cha|task lá|parent task|child task|root task)$", flags=re.IGNORECASE),
)
_PLACEHOLDER_FRAGMENTS = (
    "subtask",
    "sub-subtask",
    "cần chia nhỏ",
    "task lá",
    "task cha",
    "phần 1",
    "phần 2",
    "phần 3",
    "phần 4",
    "phần 5",
    "part 1",
    "part 2",
    "part 3",
    "giai đoạn 1",
    "giai đoạn 2",
    "phase 1",
    "phase 2",
)
_TRAILING_PART_PATTERN = re.compile(
    r"(?:\(|\b|[-_–—:])\s*(?:phần|part|giai\s*đoạn|phase|đợt|bước|step|chặng)\s*\d+(?:[._-]\d+)*\)?$",
    flags=re.IGNORECASE,
)


def normalize_task_title(title: Any) -> str:
    return re.sub(r"\s+", " ", str(title or "")).strip()


def strip_placeholder_part_suffix(title: Any) -> str:
    normalized = normalize_task_title(title)
    if not normalized:
        return ""
    cleaned = _TRAILING_PART_PATTERN.sub("", normalized).strip()
    cleaned = re.sub(r"\s*[-_–—:]\s*$", "", cleaned).strip()
    return cleaned or normalized


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
        '"Xử lý webhook cập nhật trạng thái đơn hàng" thay vì "Task 1" hoặc "Phần 1". '
        'Tuyệt đối không được tách cơ học thành "Phần 1", "Phần 2". Nếu không có luồng độc lập, phải giữ nguyên 1 task.'
    )


def sanitize_placeholder_tasks(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Gộp hoặc chuẩn hóa các task bị chia nhỏ cơ học thành 'Phần 1', 'Phần 2'."""
    if not isinstance(tasks, list):
        return tasks

    sanitized: list[dict[str, Any]] = []
    groups: dict[str, list[dict[str, Any]]] = {}
    order: list[str] = []

    for task in tasks:
        subtasks = task.get("subtasks")
        if isinstance(subtasks, list) and subtasks:
            task["subtasks"] = sanitize_placeholder_tasks(subtasks)

        raw_title = str(task.get("title") or "").strip()
        base_title = strip_placeholder_part_suffix(raw_title)

        if not is_meaningful_task_title(raw_title) and base_title != raw_title:
            if base_title not in groups:
                groups[base_title] = []
                order.append(base_title)
            groups[base_title].append(task)
        else:
            key = raw_title or f"__task_{len(order)}__"
            if key not in groups:
                groups[key] = []
                order.append(key)
            groups[key].append(task)

    for key in order:
        group_tasks = groups[key]
        if len(group_tasks) == 1:
            task = group_tasks[0]
            task["title"] = strip_placeholder_part_suffix(str(task.get("title") or "").strip())
            sanitized.append(task)
        else:
            has_part_suffix = any(
                not is_meaningful_task_title(t.get("title")) for t in group_tasks
            )
            if has_part_suffix:
                first = group_tasks[0]
                merged = dict(first)
                merged["title"] = key

                total_hours = sum(float(t.get("estimated_hours", 0) or 0) for t in group_tasks)
                merged["estimated_hours"] = min(8.0, total_hours) if not first.get("subtasks") else total_hours

                starts = [t["start_date"] for t in group_tasks if t.get("start_date")]
                deadlines = [t["deadline"] for t in group_tasks if t.get("deadline")]
                if starts:
                    merged["start_date"] = min(starts)
                if deadlines:
                    merged["deadline"] = max(deadlines)

                desc_objs = [t.get("description") for t in group_tasks if isinstance(t.get("description"), dict)]
                if desc_objs:
                    merged_desc: dict[str, Any] = {}
                    for field in ["objective", "criteria", "implementation", "output"]:
                        vals = []
                        for d in desc_objs:
                            v = d.get(field)
                            if v and str(v).strip() and str(v).strip() not in vals:
                                vals.append(str(v).strip())
                        clean_text = " ".join(vals)
                        clean_text = re.sub(r"\bphần\s+(?:đầu\s*tiên|thứ\s*(?:hai|ba|nhất|nhì|tư|năm|\d+))\s+của\s+", "", clean_text, flags=re.IGNORECASE)
                        clean_text = re.sub(r"\bcho\s+phần\s+(?:đầu\s*tiên|thứ\s*(?:hai|ba|nhất|nhì|tư|năm|\d+))\b", "", clean_text, flags=re.IGNORECASE)
                        clean_text = re.sub(r"\bphần\s+\d+\b", "", clean_text, flags=re.IGNORECASE)
                        clean_text = re.sub(r"\s+", " ", clean_text).strip()
                        merged_desc[field] = clean_text or (desc_objs[0].get(field) if desc_objs else "")

                    all_ac: list[str] = []
                    for d in desc_objs:
                        ac = d.get("acceptance_criteria")
                        if isinstance(ac, list):
                            for item in ac:
                                s = str(item).strip()
                                if s and s not in all_ac:
                                    all_ac.append(s)
                        elif isinstance(ac, str) and ac.strip() and ac.strip() not in all_ac:
                            all_ac.append(ac.strip())
                    merged_desc["acceptance_criteria"] = all_ac or desc_objs[0].get("acceptance_criteria", [])
                    merged["description"] = merged_desc

                sanitized.append(merged)
            else:
                sanitized.extend(group_tasks)

    return sanitized


_SHALLOW_DESC_PATTERNS = (
    re.compile(r"công\s*nghệ\s*web\s*hiện\s*đại", re.IGNORECASE),
    re.compile(r"dễ\s*sử\s*dụng\s*và\s*thân\s*thiện", re.IGNORECASE),
    re.compile(r"thân\s*thiện\s*với\s*người\s*dùng", re.IGNORECASE),
    re.compile(r"đảm\s*bảo\s*tính\s*bảo\s*mật\s*và\s*hiệu\s*suất", re.IGNORECASE),
    re.compile(r"triển\s*khai\s*các\s*phương\s*thức\s*cần\s*thiết", re.IGNORECASE),
    re.compile(r"phần\s*(?:đầu\s*tiên|thứ\s*(?:hai|ba|nhất|\d+))\s*của\s*api", re.IGNORECASE),
    re.compile(r"^giao\s*diện\s*.*hoàn\s*chỉnh\.?$", re.IGNORECASE),
    re.compile(r"^api\s*.*hoàn\s*chỉnh\.?$", re.IGNORECASE),
)


def is_shallow_task_description(desc: Any) -> bool:
    if not isinstance(desc, dict):
        return True

    for field in ("objective", "criteria", "implementation", "output"):
        val = str(desc.get(field) or "").strip()
        if len(val) < 20:
            return True
        if any(pat.search(val) for pat in _SHALLOW_DESC_PATTERNS):
            return True

    ac = desc.get("acceptance_criteria")
    if not ac:
        return True
    if isinstance(ac, list) and len(ac) < 2:
        return True
    ac_text = " ".join(str(x) for x in ac) if isinstance(ac, list) else str(ac)
    if "hiển thị đúng thông tin" in ac_text.lower() and len(ac_text) < 60:
        return True

    return False


def find_shallow_task_descriptions(
    tasks_data: list[dict[str, Any]], parent_path: str = ""
) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []

    for index, task_data in enumerate(tasks_data, start=1):
        path = f"{parent_path}.{index}" if parent_path else str(index)
        title = normalize_task_title(task_data.get("title"))
        desc = task_data.get("description")

        if is_shallow_task_description(desc):
            issues.append({"path": path, "title": title or "(trống)"})

        subtasks = task_data.get("subtasks")
        if isinstance(subtasks, list) and subtasks:
            issues.extend(find_shallow_task_descriptions(subtasks, path))

    return issues


_SINGLE_STORY_PATTERNS = (
    re.compile(r"\b(?:thêm|tạo|gắn|đặt|làm|hiển\s*thị)\s+(?:nút|button|icon|cột|trường|field|tab|menu|bộ\s*lọc|filter|popup|modal|thanh\s*tìm\s*kiếm)\b", re.IGNORECASE),
    re.compile(r"\b(?:fix|sửa|khắc\s*phục|chỉnh\s*sửa|sửa\s*chữa)\s+(?:bug|lỗi|giao\s*diện|ui|css|màu|font|chữ|chính\s*tả|text|placeholder)\b", re.IGNORECASE),
    re.compile(r"\b(?:thêm|viết|tạo|cập\s*nhật)\s+(?:1\s+|một\s+)?(?:api|endpoint|service|hàm|function|query|migration)\b", re.IGNORECASE),
    re.compile(r"\b(?:xuất|export)\s+(?:file\s+)?(?:excel|pdf|csv|word|báo\s*cáo)\b", re.IGNORECASE),
    re.compile(r"\b(?:thêm|tạo|làm|sửa)\s+(?:trang|màn\s*hình|form)\s+(?:đăng\s*nhập|login|profile|đổi\s*mật\s*khẩu|dashboard|chi\s*tiết)\b", re.IGNORECASE),
    re.compile(r"\b(?:rà\s*soát|kiểm\s*tra|audit|đánh\s*giá|review|nghiên\s*cứu|tối\s*ưu|cấu\s*hình|thiết\s*lập|backup|sao\s*lưu|phục\s*hồi|dọn\s*dẹp|tài\s*liệu\s*hóa)\b", re.IGNORECASE),
    re.compile(r"\b(?:tạo|thêm|giao)\s+(?:\d+\s+)?(?:subtask|task\s*con)\b", re.IGNORECASE),
    re.compile(r"\btrực\s*thuộc\s*task\b", re.IGNORECASE),
    re.compile(r"\bthuộc\s*task\b", re.IGNORECASE),
    re.compile(r"\bvào\s*task\b", re.IGNORECASE),
    re.compile(r"^giao\s+task\s+[\"']", re.IGNORECASE),
    re.compile(r"^tạo\s+task\s+[\"']", re.IGNORECASE),
)


def is_single_story_request(text: Any) -> bool:
    normalized = normalize_task_title(text)
    if not normalized:
        return False
    raw_text = str(text).strip()

    # If the user explicitly asks to break down the task, it should NOT be treated as a strict single story
    if re.search(r"\b(?:break|breal|phân\s*rã|chia\s*nhỏ|tách)\b", raw_text, re.IGNORECASE):
        return False

    # If the user prompt is creating a subtask or adding to an existing task
    if re.search(r"\b(?:subtask|task\s*con)\b", raw_text, re.IGNORECASE):
        return True
    if re.search(r"\b(?:trực\s*thuộc|thuộc|vào)\s+task\b", raw_text, re.IGNORECASE):
        return True
    # If the user prompt specifically quotes a task or says "Giao task X cho A và B"
    if re.search(r"^giao\s+task\s+[\"'].+?[\"']\s+cho\b", raw_text, re.IGNORECASE):
        return True
    return any(pat.search(normalized) for pat in _SINGLE_STORY_PATTERNS)
