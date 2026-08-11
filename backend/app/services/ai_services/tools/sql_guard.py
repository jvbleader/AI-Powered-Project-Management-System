from __future__ import annotations

import re
from typing import Any, Callable

from langchain_core.tools import StructuredTool

_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|GRANT|REVOKE|CALL|EXEC|EXECUTE|MERGE|ATTACH|DETACH|LOAD|COPY)\b",
    re.IGNORECASE,
)


def is_select_only(sql: str) -> bool:
    cleaned = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    cleaned = re.sub(r"--.*?$", " ", cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()
    if not cleaned:
        return False
    body = cleaned.rstrip(";").strip()
    if ";" in body:
        return False
    if not re.match(r"^(WITH\b|SELECT\b)", body, re.IGNORECASE):
        return False
    return _FORBIDDEN.search(body) is None


def wrap_sql_tools(sql_tools: list[Any]) -> list[Any]:
    """Chỉ cho phép sql_db_query chạy SELECT; các tool schema/list giữ nguyên."""
    wrapped: list[Any] = []
    for tool in sql_tools:
        if getattr(tool, "name", None) != "sql_db_query":
            wrapped.append(tool)
            continue

        original_invoke: Callable[[str], Any] = tool.invoke

        def _safe_query(query: str, _invoke=original_invoke) -> str:
            if not is_select_only(query):
                return "Error: Chỉ được phép chạy câu lệnh SELECT (read-only). Câu lệnh bị từ chối."
            result = _invoke(query)
            return result if isinstance(result, str) else str(result)

        wrapped.append(
            StructuredTool.from_function(
                func=_safe_query,
                name=tool.name,
                description=(
                    getattr(tool, "description", "")
                    + " CHỈ ĐƯỢC PHÉP SELECT. Cấm INSERT/UPDATE/DELETE/DDL."
                ),
            )
        )
    return wrapped
