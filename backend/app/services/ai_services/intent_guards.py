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
