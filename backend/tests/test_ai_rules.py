from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.utils.ai_rules import (
    days_overdue,
    get_business_today,
    is_member_overloaded,
    is_near_due,
    is_overdue,
    is_task_stalled,
)


def _task(**overrides):
    base = {
        "status": "todo",
        "deadline": date(2026, 7, 16),
        "priority": "medium",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_detects_overdue_task():
    task = _task(deadline=date(2026, 7, 12))
    today = date(2026, 7, 14)

    assert is_overdue(task, today) is True
    assert days_overdue(task, today) == 2


def test_detects_near_due_task():
    task = _task(deadline=date(2026, 7, 16))

    assert is_near_due(task, date(2026, 7, 14)) is True


def test_stalled_task_requires_inactive_signal_and_attention_window():
    task = _task(deadline=date(2026, 7, 18), priority="high")
    now = datetime(2026, 7, 14, 10, 0, tzinfo=timezone.utc)
    last_signal = datetime(2026, 7, 11, 9, 0, tzinfo=timezone.utc)

    assert is_task_stalled(task, last_signal, date(2026, 7, 14), now) is True


def test_member_overload_thresholds():
    assert is_member_overloaded(4, 0) is True
    assert is_member_overloaded(2, 2) is True
    assert is_member_overloaded(2, 1) is False


def test_business_today_returns_date():
    assert isinstance(get_business_today(), date)
