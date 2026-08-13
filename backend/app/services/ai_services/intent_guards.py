"""Heuristic chặn lệnh phá hủy / SQL ghi — AI chỉ đọc + tạo bản nháp xác nhận."""

from __future__ import annotations

import re
from typing import Any


_SQL_WRITE_PATTERNS = (
    r"\bupdate\s+\w+\s+set\b",
    r"\bdelete\s+from\b",
    r"\binsert\s+into\b",
    r"\bdrop\s+(table|database|schema)\b",
    r"\btruncate\s+(table\s+)?\w+\b",
    r"\balter\s+table\b",
)

_DELETE_DATA_PATTERNS = (
    r"xóa\s+hết",
    r"xóa\s+tất\s+cả",
    r"xóa\s+toàn\s+bộ",
    r"xoa\s+het",
    r"xoa\s+tat\s+ca",
    r"xóa\s+.*\btask\b",
    r"xóa\s+.*\bcông\s+việc",
    r"xoa\s+.*\btask\b",
    r"xóa\s+.*\bdự\s+án",
    r"xóa\s+.*\buser\b",
    r"xóa\s+.*\bngười\s+dùng",
    r"delete\s+(all\s+)?tasks?\b",
    r"remove\s+(all\s+)?tasks?\b",
    r"wipe\s+(all\s+)?tasks?\b",
)


def normalize_user_text(text: Any) -> str:
    if text is None:
        return ""
    if isinstance(text, list):
        parts = []
        for part in text:
            if isinstance(part, dict):
                parts.append(str(part.get("text", part)))
            else:
                parts.append(str(part))
        text = " ".join(parts)
    q = str(text).lower()
    return q.replace("xoá", "xóa").replace("xoạ", "xóa")


def latest_user_text(messages: list | None) -> str:
    if not messages:
        return ""
    latest = messages[-1]
    content = getattr(latest, "content", latest)
    return normalize_user_text(content)


def latest_human_text(messages: list | None) -> str:
    """Lấy đúng tin nhắn người dùng mới nhất, bỏ qua AI/tool ở cuối state."""
    if not messages:
        return ""
    for message in reversed(messages):
        msg_type = getattr(message, "type", None)
        if msg_type in ("human", "user"):
            return normalize_user_text(getattr(message, "content", message))
    return latest_user_text(messages)


def latest_human_raw(messages: list | None) -> str:
    """Nội dung gốc tin nhắn người dùng mới nhất (giữ nguyên hoa/thường)."""
    if not messages:
        return ""
    for message in reversed(messages):
        msg_type = getattr(message, "type", None)
        if msg_type in ("human", "user"):
            content = getattr(message, "content", "") or ""
            if isinstance(content, list):
                return " ".join(
                    str(part.get("text", part)) if isinstance(part, dict) else str(part)
                    for part in content
                )
            return str(content)
    return ""


def resolve_mentioned_project(text: str, projects: list) -> Any | None:
    """Ưu tiên tên dự án khớp dài nhất để tránh 'Plan' nuốt 'Plan AI'."""
    q = normalize_user_text(text)
    if not q:
        return None
    q_compact = q.replace(" ", "")
    matches: list[tuple[int, Any]] = []
    for project in projects:
        name = normalize_user_text(getattr(project, "name", ""))
        if not name:
            continue
        name_compact = name.replace(" ", "")
        if name in q or (name_compact and name_compact in q_compact):
            matches.append((len(name_compact or name), project))
    if not matches:
        return None
    matches.sort(key=lambda item: item[0], reverse=True)
    return matches[0][1]


def is_destructive_or_forbidden_write(text: str) -> bool:
    """True nếu yêu cầu xóa hàng loạt / SQL ghi / thao tác phá hủy ngoài phạm vi AI."""
    q = normalize_user_text(text)
    if not q:
        return False
    if any(re.search(p, q, flags=re.IGNORECASE) for p in _SQL_WRITE_PATTERNS):
        return True
    if any(re.search(p, q, flags=re.IGNORECASE) for p in _DELETE_DATA_PATTERNS):
        return True
    return False


def refuse_destructive_message() -> str:
    return (
        "Tôi **không thể** thực hiện lệnh xóa/sửa hàng loạt hay chạy SQL ghi dữ liệu "
        "(`DELETE` / `UPDATE ... SET` / `DROP`…).\n\n"
        "AI chỉ hỗ trợ **tra cứu** và **tạo bản nháp** task/sprint để bạn xác nhận trên giao diện. "
        "Việc xóa task vui lòng thao tác trực tiếp trên UI (nếu bạn có quyền)."
    )


_CREATE_TASK_PATTERNS = (
    r"tạo\s+(cho\s+(tôi|mình)\s+)?(một\s+|1\s+)?(cây\s+)?(task|công\s+việc|cv)\b",
    r"tao\s+(cho\s+(toi|minh)\s+)?(mot\s+)?(cay\s+)?(task|cong\s+viec)\b",
    r"\b(create|generate|make)\s+(a\s+|some\s+|the\s+)?(task|tasks|wbs|backlog|tree)\b",
    r"cây\s*task",
    r"cay\s*task",
    r"task\s*tree",
    r"phân\s*rã",
    r"phan\s*ra",
    r"chia\s*nhỏ\s+(dự\s*án|du\s*an|task|công\s*việc|project)",
    r"chia\s*nho\s+(du\s*an|task|cong\s*viec|project)",
    r"lên\s*kế\s*hoạch",
    r"len\s*ke\s*hoach",
    r"lập\s*kế\s*hoạch",
    r"lap\s*ke\s*hoach",
    r"\bbreak\s*down\b",
    r"\bwbs\b",
)

_GENERIC_SCOPE_STRIP = (
    r"tạo\s+(cho\s+(tôi|mình)\s+)?",
    r"tao\s+(cho\s+(toi|minh)\s+)?",
    r"giúp\s+(tôi|mình)?",
    r"help\s+me",
    r"please",
    r"một\s+cây\s+(task|công\s+việc)",
    r"cây\s+(task|công\s+việc)",
    r"task\s+tree",
    r"\b(tasks?|backlog|wbs)\b",
    r"công\s+việc",
    r"cong\s+viec",
    r"dự\s+án",
    r"du\s+an",
    r"\bprojects?\b",
    r"phân\s*rã(\s+thành)?",
    r"phan\s*ra(\s+thanh)?",
    r"chia\s*nhỏ",
    r"chia\s*nho",
    r"lên\s*kế\s*hoạch(\s+cho)?",
    r"lập\s*kế\s*hoạch(\s+cho)?",
    r"cấu\s*trúc",
    r"danh\s*sách",
    r"agile",
    r"waterfall",
    r"\bjson_task_draft\b",
)

_FILLER_TOKENS = {
    "cho", "toi", "tôi", "minh", "mình", "mot", "một", "cai", "cái", "cac", "các",
    "voi", "với", "cua", "của", "nhe", "nhé", "di", "đi", "ạ", "à", "giup", "giúp",
    "ho", "hộ", "dum", "dùm", "please", "the", "a", "an", "in", "for", "me", "my",
    "some", "any", "vai", "vài", "nhieu", "nhiều", "het", "hết", "toan", "toàn",
    "bo", "bộ", "new", "moi", "mới", "trong", "giup", "help", "va", "và", "hoac",
    "hoặc", "hay", "them", "thêm", "to", "of", "on", "at", "la", "là", "nay", "này",
}


_DATE_STRIP = r"\d{4}-\d{2}-\d{2}"
_CLAUSE_STRIP = (
    r"mục\s*tiêu\b.+$",
    r"muc\s*tieu\b.+$",
    r"\bgoal\b.+$",
    r"mô\s*tả\b.+$",
    r"mo\s*ta\b.+$",
    r"\bdescription\b.+$",
    r"từ\s+ngày\b.+$",
    r"đến\s+ngày\b.+$",
    r"den\s+ngay\b.+$",
    r"start_date\b.+$",
    r"end_date\b.+$",
    r"deadline\b.+$",
)
_NON_NAME_STRIP = (
    r"tiếp\s*theo",
    r"tiep\s*theo",
    r"\bnext\b",
    r"\bngày\b",
    r"\bngay\b",
)


def _has_quoted_or_labeled_name(text: str) -> bool:
    if re.search(r"[\"“”'].+?[\"“”']", text):
        return True
    if re.search(
        r"tên\s+(sprint|task|công\s*việc|cv)?\s*(là|:)?\s*\S+",
        text,
        flags=re.IGNORECASE,
    ):
        return True
    if re.search(r"(named?|called)\s+\S+", text, flags=re.IGNORECASE):
        return True
    if re.search(r"gọi\s+là\s+\S+|goi\s+la\s+\S+", text, flags=re.IGNORECASE):
        return True
    return False


def _remaining_name_tokens(
    text: str,
    project_names: list[str] | None,
    generic_strips: tuple[str, ...],
) -> list[str]:
    stripped = _strip_project_mentions(text, project_names)
    stripped = re.sub(_DATE_STRIP, " ", stripped)
    for pattern in _CLAUSE_STRIP:
        stripped = re.sub(pattern, " ", stripped, flags=re.IGNORECASE)
    for pattern in generic_strips:
        stripped = re.sub(pattern, " ", stripped, flags=re.IGNORECASE)
    for pattern in _NON_NAME_STRIP:
        stripped = re.sub(pattern, " ", stripped, flags=re.IGNORECASE)
    stripped = re.sub(
        r"[^\wàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]+",
        " ",
        stripped,
        flags=re.IGNORECASE,
    )
    return [
        token
        for token in stripped.split()
        if token not in _FILLER_TOKENS and len(token) >= 1
    ]


def looks_like_task_create(text: str) -> bool:
    q = normalize_user_text(text)
    if not q:
        return False
    return any(re.search(p, q, flags=re.IGNORECASE) for p in _CREATE_TASK_PATTERNS)


def is_underspecified_task_create(text: str, project_names: list[str] | None = None) -> bool:
    """True khi tạo task thường nhưng chưa nêu tên task. Cây task / WBS cả dự án thì không cần tên."""
    q = normalize_user_text(text)
    if not looks_like_task_create(q):
        return False
    if looks_like_task_tree_request(q):
        return False
    if re.search(
        r"phân\s*rã|phan\s*ra|chia\s*nhỏ|chia\s*nho|lên\s*kế\s*hoạch|len\s*ke\s*hoach|"
        r"lập\s*kế\s*hoạch|lap\s*ke\s*hoach|\bbreak\s*down\b|\bwbs\b",
        q,
        flags=re.IGNORECASE,
    ):
        return False
    if _has_quoted_or_labeled_name(q):
        return False
    return len(_remaining_name_tokens(q, project_names, _GENERIC_SCOPE_STRIP)) < 1


def clarify_underspecified_task_message(project_hint: str | None = None) -> str:
    return "Hãy cung cấp cho mình thêm thông tin về nhiệm vụ task bạn định tạo nhé"


_TASK_TREE_PATTERNS = (
    r"cây\s*task",
    r"cay\s*task",
    r"task\s*tree",
    r"cây\s*công\s*việc",
    r"cay\s*cong\s*viec",
    r"cấu\s*trúc\s*cây",
    r"cau\s*truc\s*cay",
    r"\bwbs\b",
    r"work\s*breakdown",
    r"cây\s*wbs",
)


def looks_like_task_tree_request(text: str) -> bool:
    q = normalize_user_text(text)
    if not q:
        return False
    return any(re.search(p, q, flags=re.IGNORECASE) for p in _TASK_TREE_PATTERNS)


def refuse_task_tree_on_agile_message(project_name: str | None = None) -> str:
    loc = f" **{project_name}**" if project_name else " này"
    return (
        f"Dự án{loc} đang quản lý theo mô hình **Agile**, nên không hỗ trợ cây task (WBS). "
        "Cấu trúc cha-con chỉ dùng cho dự án **Waterfall**."
    )


_SPRINT_PATTERNS = (
    r"\bsprints?\b",
    r"tạo\s+(cho\s+(tôi|mình)\s+)?(một\s+|1\s+)?sprint",
    r"tao\s+(cho\s+(toi|minh)\s+)?(mot\s+)?sprint",
    r"xem\s+sprint",
    r"liệt\s*kê\s+sprint",
    r"liet\s*ke\s+sprint",
    r"danh\s*sách\s+sprint",
    r"đổi\s+trạng\s+thái\s+sprint",
    r"doi\s+trang\s+thai\s+sprint",
    r"(bắt\s*đầu|dong|đóng|kết\s*thúc|ket\s*thuc)\s+sprint",
)

_CREATE_SPRINT_PATTERNS = (
    r"tạo\s+(cho\s+(tôi|mình)\s+)?(một\s+|1\s+)?sprint",
    r"tao\s+(cho\s+(toi|minh)\s+)?(mot\s+)?sprint",
    r"\b(create|make|add|generate)\s+(a\s+|new\s+)?sprint\b",
    r"sprint\s+mới",
    r"sprint\s+moi",
)

_SPRINT_GENERIC_STRIP = (
    r"tạo\s+(cho\s+(tôi|mình)\s+)?",
    r"tao\s+(cho\s+(toi|minh)\s+)?",
    r"giúp\s+(tôi|mình)?",
    r"help\s+me",
    r"please",
    r"\bsprints?\b",
    r"dự\s+án",
    r"du\s+an",
    r"\bprojects?\b",
    r"agile",
    r"waterfall",
    r"mới",
    r"moi",
    r"\bjson_sprint_draft\b",
    r"tự\s+động\s+điền",
    r"tu\s+dong\s+dien",
)


def looks_like_sprint_request(text: str) -> bool:
    q = normalize_user_text(text)
    if not q:
        return False
    return any(re.search(p, q, flags=re.IGNORECASE) for p in _SPRINT_PATTERNS)


def looks_like_sprint_create(text: str) -> bool:
    q = normalize_user_text(text)
    if not q:
        return False
    return any(re.search(p, q, flags=re.IGNORECASE) for p in _CREATE_SPRINT_PATTERNS)


def refuse_sprint_create_permission_message(project_name: str | None = None) -> str:
    loc = f" **{project_name}**" if project_name else " này"
    return (
        f"Bạn không có quyền tạo sprint cho dự án{loc}. "
        "Chỉ **PM/PO/GM** hoặc **Leader** của dự án đó mới được tạo sprint."
    )


def refuse_sprint_on_waterfall_message(project_name: str | None = None) -> str:
    loc = f" **{project_name}**" if project_name else " này"
    return (
        f"Dự án{loc} đang quản lý theo mô hình **Waterfall**, nên không có khái niệm Sprint. "
        "Sprint chỉ được tạo và sử dụng cho dự án **Agile**."
    )


def _strip_project_mentions(text: str, project_names: list[str] | None) -> str:
    stripped = text
    for name in project_names or []:
        n = normalize_user_text(name)
        if not n:
            continue
        stripped = stripped.replace(n, " ")
        stripped = stripped.replace(n.replace(" ", ""), " ")
        compact = n.replace(" ", "")
        if len(compact) >= 3:
            flexible = r"[\s\-]*".join(re.escape(ch) for ch in compact)
            stripped = re.sub(flexible, " ", stripped, flags=re.IGNORECASE)
    return stripped


def is_underspecified_sprint_create(text: str, project_names: list[str] | None = None) -> bool:
    """True khi tạo sprint nhưng chưa nêu tên sprint. Ngày/mô tả không được coi là đã đủ."""
    q = normalize_user_text(text)
    if not looks_like_sprint_create(q):
        return False
    if _has_quoted_or_labeled_name(q):
        return False
    if re.search(r"\bsprint\s*[-_]?\s*\d+\b", q, flags=re.IGNORECASE):
        return False
    return len(_remaining_name_tokens(q, project_names, _SPRINT_GENERIC_STRIP)) < 1


def clarify_underspecified_sprint_message(project_hint: str | None = None) -> str:
    loc = f" cho dự án **{project_hint}**" if project_hint else ""
    return (
        f"Bạn muốn đặt tên sprint{loc} là gì? (ví dụ: Sprint 2, Sprint Auth)\n\n"
        "Mô tả/mục tiêu và ngày bắt đầu–kết thúc mình sẽ lấy đúng theo tiến độ dự án hiện tại."
    )


RECENT_HISTORY_LIMIT = 20
_AI_HISTORY_MAX_CHARS = 550
_HUMAN_HISTORY_MAX_CHARS = 900
_LOW_WEIGHT_HISTORY_HEADER = (
    "[LỊCH SỬ THAM CHIẾU — TRỌNG SỐ 30–40%]\n"
    "Dùng để hiểu ngữ cảnh, đại từ và follow-up (vd 'dự án đó', 'người kia').\n"
    "CẤM sao chép câu trả lời, checklist, số liệu, cách hỏi, hoặc bản nháp JSON từ lịch sử.\n"
    "Mỗi lượt PHẢI suy nghĩ lại từ YÊU CẦU MỚI NHẤT (trọng số 100%) + CONTEXT/tool hiện tại. "
    "Không được lười lấy lại câu cũ — đó là hallucination."
)


def _trim_history_content(message) -> str:
    content = str(getattr(message, "content", "") or "")
    msg_type = getattr(message, "type", "") or ""
    if msg_type not in ("human", "user"):
        lowered = content.lower()
        if "json_task_draft" in lowered or "json_sprint_draft" in lowered or "json_sprint_status_draft" in lowered:
            ids = _DRAFT_PROJECT_ID_RE.findall(content)
            names = _DRAFT_PROJECT_NAME_RE.findall(content)
            hint_parts = []
            if names:
                hint_parts.append(names[-1])
            if ids:
                hint_parts.append(f"ID {ids[-1]}")
            hint = f" — dự án {' / '.join(hint_parts)}" if hint_parts else ""
            return f"[Bản nháp JSON lượt trước{hint} — chỉ tham chiếu, CẤM sao chép nguyên văn]"
        if len(content) > _AI_HISTORY_MAX_CHARS:
            return content[:_AI_HISTORY_MAX_CHARS] + "\n…(đã rút gọn, trọng số 30–40%)"
        return content
    if len(content) > _HUMAN_HISTORY_MAX_CHARS:
        return content[:_HUMAN_HISTORY_MAX_CHARS] + "\n…(đã rút gọn)"
    return content


def build_low_weight_history_block(messages: list | None) -> str:
    """Giữ tối đa 20 tin trước lượt hiện tại, trọng số 30–40%, để AI không copy câu cũ."""
    if not messages:
        return ""

    history: list = []
    skipped_latest_human = False
    for message in reversed(messages):
        msg_type = getattr(message, "type", None)
        if not skipped_latest_human and msg_type in ("human", "user"):
            skipped_latest_human = True
            continue
        if msg_type not in ("human", "user", "ai", "assistant"):
            continue
        history.append(message)
        if len(history) >= RECENT_HISTORY_LIMIT:
            break
    if not history:
        return ""

    history.reverse()
    lines = [_LOW_WEIGHT_HISTORY_HEADER, ""]
    for message in history:
        role = "User" if getattr(message, "type", "") in ("human", "user") else "AI"
        lines.append(f"{role}: {_trim_history_content(message)}")
    return "\n".join(lines)


def low_weight_summary_block(summary: str | None) -> str:
    text = (summary or "").strip()
    if not text:
        return ""
    text = text.replace("{", "{{").replace("}", "}}")
    return (
        "\n\n[TÓM TẮT CŨ HƠN 20 TIN — TRỌNG SỐ ~15%, chỉ để nhớ tên dự án/người/ID]\n"
        f"{text}"
    )


_WIDE_PROJECT_SCOPE_PATTERNS = (
    r"các\s+dự\s+án",
    r"cac\s+du\s+an",
    r"tất\s+cả(\s+các)?\s+(dự\s+án|project|task|công\s+việc)",
    r"tat\s+ca(\s+cac)?\s+(du\s+an|project|task|cong\s+viec)",
    r"toàn\s+bộ(\s+các)?\s+(dự\s+án|project)",
    r"toan\s+bo(\s+cac)?\s+(du\s+an|project)",
    r"mọi\s+dự\s+án",
    r"moi\s+du\s+an",
    r"dự\s+án\s+tôi\s+quản\s+lý",
    r"du\s+an\s+toi\s+quan\s+ly",
    r"các\s+dự\s+án\s+tôi",
    r"all\s+projects?",
    r"every\s+project",
)

_DRAFT_PROJECT_ID_RE = re.compile(r'"project_id"\s*:\s*(\d+)')
_DRAFT_PROJECT_NAME_RE = re.compile(r'"project_name"\s*:\s*"([^"]+)"')


def is_wide_project_scope(text: str) -> bool:
    q = normalize_user_text(text)
    if not q:
        return False
    return any(re.search(pattern, q, flags=re.IGNORECASE) for pattern in _WIDE_PROJECT_SCOPE_PATTERNS)


def _project_by_id(projects: list, project_id: int | str | None):
    if project_id is None or project_id == "":
        return None
    return next((project for project in projects if str(project.id) == str(project_id)), None)


def _message_text(message) -> str:
    content = getattr(message, "content", "") or ""
    if isinstance(content, list):
        return " ".join(
            str(part.get("text", part)) if isinstance(part, dict) else str(part)
            for part in content
        )
    return str(content)


_TASK_DETAIL_QUESTION_PATTERNS = (
    r"thêm\s+thông\s+tin.*\b(task|nhiệm\s+vụ|công\s+việc)\b",
    r"\b(tên|mô\s+tả|thông\s+tin).*\b(task|nhiệm\s+vụ|công\s+việc)\b",
    r"\b(task|nhiệm\s+vụ|công\s+việc)\b.*\b(tên|mô\s+tả|thông\s+tin)\b",
    r"\b(task|nhiệm\s+vụ|công\s+việc)\b.*\b(bạn\s+muốn|định)\s+tạo\b",
)


def is_task_creation_followup(messages: list | None) -> bool:
    """True khi user đang trả lời câu hỏi bổ sung cho bản nháp task."""
    if not messages:
        return False

    latest_human_index = next(
        (
            index
            for index in range(len(messages) - 1, -1, -1)
            if getattr(messages[index], "type", None) in ("human", "user")
        ),
        None,
    )
    if latest_human_index is None:
        return False

    latest = normalize_user_text(_message_text(messages[latest_human_index]))
    if not latest or is_destructive_or_forbidden_write(latest):
        return False

    for message in reversed(messages[:latest_human_index]):
        if getattr(message, "type", None) not in ("ai", "assistant"):
            continue
        previous_ai = normalize_user_text(_message_text(message))
        return any(
            re.search(pattern, previous_ai, flags=re.IGNORECASE)
            for pattern in _TASK_DETAIL_QUESTION_PATTERNS
        )
    return False


def resolve_conversation_project(
    messages: list | None,
    projects: list,
    summary: str | None = None,
):
    """Lấy dự án đang nói trong hội thoại (tin mới hơn thắng). Bỏ qua tin user mới nhất."""
    if not projects:
        return None

    texts: list[str] = []
    skipped_latest_human = False
    for message in reversed(messages or []):
        msg_type = getattr(message, "type", None)
        if not skipped_latest_human and msg_type in ("human", "user"):
            skipped_latest_human = True
            continue
        if msg_type not in ("human", "user", "ai", "assistant"):
            continue
        texts.append(_message_text(message))
        if len(texts) >= RECENT_HISTORY_LIMIT:
            break
    if summary:
        texts.append(str(summary))

    for text in texts:
        ids = _DRAFT_PROJECT_ID_RE.findall(text)
        unique_ids = list(dict.fromkeys(ids))
        if len(unique_ids) == 1:
            hit = _project_by_id(projects, unique_ids[0])
            if hit is not None:
                return hit
        names = _DRAFT_PROJECT_NAME_RE.findall(text)
        if names:
            hit = resolve_mentioned_project(names[-1], projects)
            if hit is not None:
                return hit
        hit = resolve_mentioned_project(text, projects)
        if hit is not None:
            return hit
    return None


def format_active_project_line(project) -> str:
    if project is None:
        return "Chưa xác định"
    ptype = (getattr(project, "project_type", "") or "").strip() or "?"
    return f"{project.name} (ID: {project.id}, Type: {ptype})"


def resolve_guard_project(
    text: str,
    projects: list,
    default_project_id: int | str | None = None,
    *,
    messages: list | None = None,
    summary: str | None = None,
    conversation_project_id: int | str | None = None,
):
    target = resolve_mentioned_project(text, projects)
    if target is not None:
        return target
    if is_wide_project_scope(text):
        return None
    target = resolve_conversation_project(messages, projects, summary)
    if target is not None:
        return target
    target = _project_by_id(projects, conversation_project_id)
    if target is not None:
        return target
    return _project_by_id(projects, default_project_id)


def task_create_hard_guard_message(
    text: str,
    projects: list,
    default_project_id: int | str | None = None,
    *,
    current_user=None,
    db=None,
    messages: list | None = None,
    summary: str | None = None,
    conversation_project_id: int | str | None = None,
) -> str | None:
    """Luật cứng theo tin mới nhất, nhưng tái dùng dự án đang nói trong hội thoại khi follow-up."""
    target = resolve_guard_project(
        text,
        projects,
        default_project_id,
        messages=messages,
        summary=summary,
        conversation_project_id=conversation_project_id,
    )
    project_names = [getattr(project, "name", "") for project in projects]
    hint = getattr(target, "name", None) if target is not None else None

    if looks_like_sprint_request(text) and target is not None:
        if (getattr(target, "project_type", "") or "").strip().lower() == "waterfall":
            return refuse_sprint_on_waterfall_message(hint)

    if looks_like_sprint_create(text) and target is not None and db is not None and current_user is not None:
        from app.utils.project_helpers import user_can_manage_sprints

        if not user_can_manage_sprints(db, target.id, current_user):
            return refuse_sprint_create_permission_message(hint)

    if looks_like_task_tree_request(text) and target is not None:
        if (getattr(target, "project_type", "") or "").strip().lower() == "agile":
            return refuse_task_tree_on_agile_message(hint)

    if (
        (looks_like_sprint_create(text) or looks_like_task_create(text))
        and target is None
    ):
        return (
            "Bạn muốn lập bản nháp cho dự án nào? "
            "Hãy nêu tên dự án (hoặc mở trang dự án đó) để mình đọc nội dung hiện có và soạn draft."
        )

    if is_underspecified_task_create(text, project_names):
        return clarify_underspecified_task_message(hint)

    return None


def refuse_if_unauthorized_sprint_draft(
    output: str | None,
    text: str,
    projects: list,
    default_project_id: int | str | None = None,
    *,
    current_user=None,
    db=None,
    messages: list | None = None,
    summary: str | None = None,
    conversation_project_id: int | str | None = None,
) -> str | None:
    """Chặn output AI chứa json_sprint_draft khi user không phải PM/Leader của dự án."""
    if not output or "json_sprint_draft" not in output:
        return None
    if db is None or current_user is None:
        return None
    from app.utils.project_helpers import user_can_manage_sprints

    target = resolve_guard_project(
        text,
        projects,
        default_project_id,
        messages=messages,
        summary=summary,
        conversation_project_id=conversation_project_id,
    )
    if target is None:
        return None
    if user_can_manage_sprints(db, target.id, current_user):
        return None
    return refuse_sprint_create_permission_message(getattr(target, "name", None))


def remember_conversation_project(db, conversation_id, user_id, project) -> None:
    if db is None or project is None or user_id is None or not conversation_id:
        return
    try:
        conv_id = int(conversation_id)
    except (TypeError, ValueError):
        return
    from app.repositories import ai_repository

    session = ai_repository.get_session_by_id_and_user(db, conv_id, user_id)
    if session is not None and session.project_id != getattr(project, "id", None):
        session.project_id = project.id
