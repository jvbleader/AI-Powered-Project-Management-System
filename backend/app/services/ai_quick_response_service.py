from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.task_model import Task
from app.models.user_model import User
from app.schemas.ai_schema import (
    QuickResponseAction,
    QuickResponseEntity,
    QuickResponseRequest,
    QuickResponseResponse,
)
from app.services.ai_context_service import (
    ProjectMemberSnapshot,
    QuickResponseContext,
    load_quick_response_context,
)
from app.utils.ai_rules import (
    TOP_FOLLOW_UP_MEMBERS,
    TOP_OVERDUE_ITEMS,
    TOP_PRIORITY_ITEMS,
    TOP_STALLED_ITEMS,
    days_overdue,
    days_since_signal,
    days_until_deadline,
    is_high_priority,
    is_near_due,
    is_open_task,
    is_overdue,
    normalize_priority,
)
from app.utils.dashboard_helpers import normalize_task_status

DATA_FRESHNESS_NOTE = "Dua tren du lieu task va logwork hien co trong du an."


@dataclass
class TaskInsight:
    task: Task
    score: int
    reasons: list[str]


@dataclass
class MemberInsight:
    member: ProjectMemberSnapshot
    score: int
    reasons: list[str]


def handle_quick_response(
    db: Session,
    current_user: User,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    context = load_quick_response_context(db, current_user, payload.project_id)

    handlers = {
        QuickResponseAction.DAILY_PRIORITY: _build_daily_priority_response,
        QuickResponseAction.STALLED_TASKS: _build_stalled_tasks_response,
        QuickResponseAction.CRITICAL_OVERDUE: _build_critical_overdue_response,
        QuickResponseAction.FOLLOW_UP_MEMBERS: _build_follow_up_members_response,
        QuickResponseAction.LEADER_BRIEF: _build_leader_brief_response,
        QuickResponseAction.TASK_HEALTH: _build_task_health_response,
    }

    handler = handlers[payload.action]
    return handler(context, payload)


def _build_response(
    context: QuickResponseContext,
    action: QuickResponseAction,
    title: str,
    summary: str,
    evidence: list[str] | None = None,
    recommendations: list[str] | None = None,
    entities: list[QuickResponseEntity] | None = None,
) -> QuickResponseResponse:
    return QuickResponseResponse(
        action=action,
        title=title,
        summary=summary,
        evidence=evidence or [],
        recommendations=recommendations or [],
        entities=entities or [],
        generated_at=context.now,
        data_freshness_note=DATA_FRESHNESS_NOTE,
    )


def _task_key(task: Task) -> str:
    return f"TASK-{task.id}"


def _task_title(task: Task) -> str:
    return task.title.strip() if task.title else _task_key(task)


def _task_entity(task: Task) -> QuickResponseEntity:
    return QuickResponseEntity(
        type="task",
        id=str(task.id),
        label=_task_key(task),
        meta=_task_title(task),
    )


def _member_entity(member: ProjectMemberSnapshot) -> QuickResponseEntity:
    return QuickResponseEntity(
        type="user",
        id=str(member.user_id),
        label=member.name,
        meta=member.email,
    )


def _primary_assignee_name(context: QuickResponseContext, task_id: int) -> str:
    assignee = context.get_primary_assignee(task_id)
    return assignee.name if assignee else "nguoi phu trach hien tai"


def _format_days_label(days: int, singular: str = "ngay") -> str:
    return f"{days} {singular}"


def _build_daily_priority_insights(context: QuickResponseContext) -> list[TaskInsight]:
    insights: list[TaskInsight] = []
    for task in context.leaf_tasks:
        if not is_open_task(task):
            continue

        score = 0
        reasons: list[str] = []
        assignee = context.get_primary_assignee(task.id)

        if is_overdue(task, context.today):
            overdue_days = days_overdue(task, context.today)
            score += 60
            reasons.append(f"qua han {_format_days_label(overdue_days)}")
        elif is_near_due(task, context.today):
            days_left = days_until_deadline(task, context.today)
            if days_left is not None:
                score += 30
                reasons.append(f"con {days_left} ngay den han")

        if task.id in context.stalled_task_ids:
            idle_days = days_since_signal(context.last_signal_by_task_id.get(task.id), context.now)
            score += 25
            if idle_days is not None:
                reasons.append(f"khong co cap nhat {idle_days} ngay")

        priority = normalize_priority(task.priority)
        if priority == "critical":
            score += 25
            reasons.append("do uu tien critical")
        elif priority == "high":
            score += 15
            reasons.append("do uu tien cao")

        if assignee and context.is_member_overloaded(assignee.user_id):
            score += 10
            reasons.append(f"{assignee.name} dang giu tai cao")

        if assignee and assignee.user_id in context.missing_logwork_user_ids:
            score += 10
            reasons.append(f"{assignee.name} chua logwork hom nay")

        if score > 0:
            insights.append(TaskInsight(task=task, score=score, reasons=reasons))

    insights.sort(
        key=lambda insight: (
            -insight.score,
            task_is_missing_deadline(insight.task),
            insight.task.deadline or date.max,
            insight.task.id,
        )
    )
    return insights


def _build_stalled_task_insights(context: QuickResponseContext) -> list[TaskInsight]:
    insights: list[TaskInsight] = []
    for task in context.leaf_tasks:
        if task.id not in context.stalled_task_ids:
            continue

        score = 20
        reasons: list[str] = []
        idle_days = days_since_signal(context.last_signal_by_task_id.get(task.id), context.now)
        if idle_days is not None:
            reasons.append(f"khong co cap nhat {idle_days} ngay")

        if is_overdue(task, context.today):
            score += 25
            reasons.append(f"qua han {_format_days_label(days_overdue(task, context.today))}")
        elif is_near_due(task, context.today):
            days_left = days_until_deadline(task, context.today)
            if days_left is not None:
                score += 20
                reasons.append(f"con {days_left} ngay den han")

        if is_high_priority(task.priority):
            score += 15
            reasons.append("do uu tien cao")

        insights.append(TaskInsight(task=task, score=score, reasons=reasons))

    insights.sort(
        key=lambda insight: (
            -insight.score,
            task_is_missing_deadline(insight.task),
            insight.task.deadline or date.max,
            insight.task.id,
        )
    )
    return insights


def _build_overdue_task_insights(context: QuickResponseContext) -> list[TaskInsight]:
    insights: list[TaskInsight] = []
    for task in context.leaf_tasks:
        if task.id not in context.overdue_task_ids:
            continue

        overdue_days = min(25, days_overdue(task, context.today) * 5)
        score = overdue_days
        reasons = [f"qua han {_format_days_label(days_overdue(task, context.today))}"]

        priority = normalize_priority(task.priority)
        if priority == "critical":
            score += 25
            reasons.append("do uu tien critical")
        elif priority == "high":
            score += 15
            reasons.append("do uu tien cao")

        if task.id in context.stalled_task_ids:
            score += 15
            reasons.append("dang dung yen")

        assignee = context.get_primary_assignee(task.id)
        if assignee and context.is_member_overloaded(assignee.user_id):
            score += 10
            reasons.append(f"{assignee.name} dang qua tai")

        insights.append(TaskInsight(task=task, score=score, reasons=reasons))

    insights.sort(
        key=lambda insight: (
            -insight.score,
            -(days_overdue(insight.task, context.today)),
            insight.task.deadline or date.max,
            insight.task.id,
        )
    )
    return insights


def _build_follow_up_member_insights(context: QuickResponseContext) -> list[MemberInsight]:
    insights: list[MemberInsight] = []
    for member in context.project_members:
        score = 0
        reasons: list[str] = []
        assigned_open_tasks = context.open_tasks_by_user_id.get(member.user_id, [])
        overdue_count = sum(1 for task in assigned_open_tasks if task.id in context.overdue_task_ids)
        stalled_count = sum(1 for task in assigned_open_tasks if task.id in context.stalled_task_ids)

        if member.user_id in context.missing_logwork_user_ids:
            score += 40
            reasons.append("chua logwork hom nay")

        if overdue_count:
            score += overdue_count * 20
            reasons.append(f"{overdue_count} task dang qua han")

        if stalled_count:
            score += stalled_count * 15
            reasons.append(f"{stalled_count} task dang dung yen")

        if len(assigned_open_tasks) >= 4:
            score += 10
            reasons.append(f"dang giu {len(assigned_open_tasks)} task mo")

        if score >= 40:
            insights.append(MemberInsight(member=member, score=score, reasons=reasons))

    insights.sort(key=lambda insight: (-insight.score, insight.member.name.lower()))
    return insights


def _build_daily_priority_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    insights = _build_daily_priority_insights(context)[:TOP_PRIORITY_ITEMS]
    if not insights:
        open_tasks = [task for task in context.leaf_tasks if is_open_task(task)]
        if not open_tasks:
            return _build_response(
                context,
                payload.action,
                "Khong con viec mo can theo sat",
                "Du an hien khong con leaf task nao dang mo can uu tien trong hom nay.",
                recommendations=["Tiep tuc duy tri cap nhat logwork va theo doi cac dau moc moi."],
                entities=[QuickResponseEntity(type="project", id=str(context.project.id), label=context.project.name)],
            )

        return _build_response(
            context,
            payload.action,
            "Chua co diem nong ro rang",
            "Hom nay chua co task nao vuot nguong can can thiep ngay theo bo rule hien tai.",
            evidence=[f"Con {len(open_tasks)} task mo nhung chua co task nao vua qua han vua dung yen."],
            recommendations=["Tiep tuc uu tien theo han chot gan nhat va giu deu logwork trong ngay."],
            entities=[QuickResponseEntity(type="project", id=str(context.project.id), label=context.project.name)],
        )

    evidence = [_format_task_insight(context, insight) for insight in insights]
    recommendations = [
        f"Follow up {_task_key(insight.task)} voi {_primary_assignee_name(context, insight.task.id)} trong hom nay."
        for insight in insights
    ]
    return _build_response(
        context,
        payload.action,
        "3 viec nen theo sat hom nay",
        f"Co {len(insights)} task dang noi len ro nhat theo rule overdue, stalled, priority va tai cua nguoi xu ly.",
        evidence=evidence,
        recommendations=recommendations,
        entities=[_task_entity(insight.task) for insight in insights],
    )


def _build_stalled_tasks_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    insights = _build_stalled_task_insights(context)[:TOP_STALLED_ITEMS]
    if not insights:
        return _build_response(
            context,
            payload.action,
            "Khong co task dung yen dang lo",
            "Hien chua co task nao thoa dieu kien dung yen trong nhom can canh bao som.",
            evidence=["Khong co leaf task nao mat cap nhat tu 2 ngay tro len va dong thoi sap den han hoac uu tien cao."],
            recommendations=["Duy tri cap nhat logwork hang ngay cho cac task gan han."],
            entities=[QuickResponseEntity(type="project", id=str(context.project.id), label=context.project.name)],
        )

    return _build_response(
        context,
        payload.action,
        "Danh sach task dang dung yen",
        f"Co {len(insights)} task dang mat tin hieu cap nhat va can duoc kiem tra lai som.",
        evidence=[_format_task_insight(context, insight) for insight in insights],
        recommendations=[
            f"Yeu cau {_primary_assignee_name(context, insight.task.id)} cap nhat tien do cho {_task_key(insight.task)}."
            for insight in insights[:3]
        ],
        entities=[_task_entity(insight.task) for insight in insights],
    )


def _build_critical_overdue_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    insights = _build_overdue_task_insights(context)[:TOP_OVERDUE_ITEMS]
    if not insights:
        return _build_response(
            context,
            payload.action,
            "Khong co task tre han",
            "Khong phat hien leaf task nao dang qua han trong du an nay.",
            recommendations=["Tiep tuc giu nhip cap nhat va theo doi nho nhung task gan han."],
            entities=[QuickResponseEntity(type="project", id=str(context.project.id), label=context.project.name)],
        )

    return _build_response(
        context,
        payload.action,
        "Task tre han dang lo nhat",
        f"Co {len(insights)} task qua han noi bat nhat theo so ngay tre, muc uu tien va tai cua nguoi phu trach.",
        evidence=[_format_task_insight(context, insight) for insight in insights],
        recommendations=[
            f"Uu tien go vuong {_task_key(insight.task)} truoc vi day la task tre han co do rui ro cao."
            for insight in insights[:3]
        ],
        entities=[_task_entity(insight.task) for insight in insights],
    )


def _build_follow_up_members_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    insights = _build_follow_up_member_insights(context)[:TOP_FOLLOW_UP_MEMBERS]
    if not insights:
        return _build_response(
            context,
            payload.action,
            "Chua co ai can follow-up gap",
            "Khong co thanh vien nao vuot nguong follow-up theo rule hien tai.",
            evidence=["Tat ca thanh vien deu hoac da logwork hom nay, hoac khong giu task qua han dung yen dang ke."],
            recommendations=["Tiep tuc nhac nhe theo lich logwork thong thuong."],
            entities=[QuickResponseEntity(type="project", id=str(context.project.id), label=context.project.name)],
        )

    return _build_response(
        context,
        payload.action,
        "Thanh vien nen duoc nhac hom nay",
        f"Co {len(insights)} thanh vien vuot nguong follow-up do thieu logwork hoac dang giu task can can thiep.",
        evidence=[
            f"{insight.member.name}: {'; '.join(insight.reasons[:3])}."
            for insight in insights
        ],
        recommendations=[
            f"Nhac {insight.member.name} cap nhat trang thai va logwork trong hom nay."
            for insight in insights[:3]
        ],
        entities=[_member_entity(insight.member) for insight in insights],
    )


def _build_leader_brief_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    overdue_insights = _build_overdue_task_insights(context)
    stalled_insights = _build_stalled_task_insights(context)
    member_insights = _build_follow_up_member_insights(context)
    open_tasks = [task for task in context.leaf_tasks if is_open_task(task)]

    summary_parts = [
        f"Den ngay {context.today.strftime('%d/%m/%Y')}, du an dang co {len(open_tasks)} task mo va muc hoan thanh uoc tinh {context.project_progress}%.",
    ]
    if overdue_insights:
        summary_parts.append(
            f"Hien co {len(overdue_insights)} task qua han, noi bat nhat la {_task_key(overdue_insights[0].task)}."
        )
    else:
        summary_parts.append("Hien chua co task qua han trong nhom leaf task.")

    if stalled_insights:
        summary_parts.append(
            f"Co {len(stalled_insights)} task dang dung yen va can kiem tra lai tien do trong ngay."
        )
    else:
        summary_parts.append("Chua phat hien task dung yen dang lo theo rule hien tai.")

    if member_insights:
        summary_parts.append(
            f"Can follow-up {len(member_insights)} thanh vien, uu tien {member_insights[0].member.name}."
        )
    else:
        summary_parts.append("Khong co thanh vien nao vuot nguong follow-up gap.")

    recommendations = []
    if overdue_insights:
        recommendations.append(
            f"Uu tien xu ly {_task_key(overdue_insights[0].task)} truoc de giam rui ro cham tien do."
        )
    if member_insights:
        recommendations.append(
            f"Nhac {member_insights[0].member.name} cap nhat logwork va trang thai task ngay hom nay."
        )
    if not recommendations:
        recommendations.append("Tiep tuc giu nhip cap nhat task va logwork hang ngay.")

    evidence = [
        f"Project progress uoc tinh: {context.project_progress}%.",
        f"Task qua han: {len(overdue_insights)}.",
        f"Task dung yen: {len(stalled_insights)}.",
        f"Logwork coverage hom nay: {context.logwork_coverage}%.",
    ]

    entities: list[QuickResponseEntity] = [
        QuickResponseEntity(type="project", id=str(context.project.id), label=context.project.name)
    ]
    if overdue_insights:
        entities.append(_task_entity(overdue_insights[0].task))
    if member_insights:
        entities.append(_member_entity(member_insights[0].member))

    return _build_response(
        context,
        payload.action,
        "Cap nhat nhanh cho leader",
        " ".join(summary_parts),
        evidence=evidence,
        recommendations=recommendations,
        entities=entities,
    )


def _build_task_health_response(
    context: QuickResponseContext,
    payload: QuickResponseRequest,
) -> QuickResponseResponse:
    if payload.task_id is None:
        raise HTTPException(status_code=400, detail="Task ID la bat buoc cho action task_health.")

    task = context.task_by_id.get(payload.task_id)
    if not task or task.project_id != context.project.id:
        raise HTTPException(status_code=404, detail="Khong tim thay task trong du an da chon.")

    priority = normalize_priority(task.priority)
    assignee = context.get_primary_assignee(task.id)
    stalled = task.id in context.stalled_task_ids
    overdue = task.id in context.overdue_task_ids
    near_due = is_near_due(task, context.today)

    severity = "healthy"
    if overdue and stalled:
        severity = "critical"
    elif overdue:
        severity = "risk"
    elif stalled and near_due:
        severity = "critical"
    elif stalled or near_due or priority in {"high", "critical"}:
        severity = "watch"

    evidence = [
        f"Trang thai hien tai: {normalize_task_status(task.status)}.",
        f"Do uu tien: {priority}.",
    ]
    if task.deadline:
        evidence.append(f"Han chot: {task.deadline.strftime('%d/%m/%Y')}.")
    if stalled:
        idle_days = days_since_signal(context.last_signal_by_task_id.get(task.id), context.now)
        if idle_days is not None:
            evidence.append(f"Task khong co cap nhat {idle_days} ngay.")
    if overdue:
        evidence.append(f"Task da qua han {_format_days_label(days_overdue(task, context.today))}.")
    if assignee:
        evidence.append(f"Nguoi phu trach hien tai: {assignee.name}.")

    recommendations = []
    if severity == "critical":
        recommendations.append(f"Can kiem tra ngay {_task_key(task)} voi {_primary_assignee_name(context, task.id)}.")
    elif severity == "risk":
        recommendations.append(f"Nen chot cach go vuong cho {_task_key(task)} trong hom nay.")
    elif severity == "watch":
        recommendations.append(f"Theo doi sat cap nhat tiep theo cua {_task_key(task)} truoc han chot.")
    else:
        recommendations.append(f"Tiep tuc duy tri nhip cap nhat deu cho {_task_key(task)}.")

    title = f"Suc khoe nhanh cua {_task_key(task)}"
    summary = f"{_task_key(task)} dang o muc {severity} theo bo rule deadline, cap nhat gan nhat va muc uu tien."
    entities = [_task_entity(task)]
    if assignee and assignee.user_id in context.member_by_user_id:
        entities.append(_member_entity(context.member_by_user_id[assignee.user_id]))

    return _build_response(
        context,
        payload.action,
        title,
        summary,
        evidence=evidence,
        recommendations=recommendations,
        entities=entities,
    )


def _format_task_insight(context: QuickResponseContext, insight: TaskInsight) -> str:
    task = insight.task
    assignee = context.get_primary_assignee(task.id)
    owner_label = f" | phu trach: {assignee.name}" if assignee else ""
    return f"{_task_key(task)} - {_task_title(task)}{owner_label}: {'; '.join(insight.reasons[:3])}."


def task_is_missing_deadline(task: Task) -> bool:
    return task.deadline is None
