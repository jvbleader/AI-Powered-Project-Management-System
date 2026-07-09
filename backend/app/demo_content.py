from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from typing import Iterable

from sqlalchemy.orm import Session

from app.models.department_model import Department
from app.models.logworks import LogWork
from app.models.project_model import Project
from app.models.sprint_model import Sprint
from app.models.task_model import Task, TaskComment
from app.models.user_model import User

DEPARTMENT_NAMES = [
    "Engineering",
    "Product",
    "Design",
    "Quality Assurance",
    "Operations",
    "Finance",
    "Data",
    "Customer Success",
    "Marketing",
    "People Operations",
]

EMPLOYEE_FAMILIES = [
    "Nguyen",
    "Tran",
    "Le",
    "Pham",
    "Hoang",
    "Vo",
    "Bui",
    "Dang",
    "Do",
    "Truong",
]

EMPLOYEE_GIVEN_NAMES = [
    "Minh Anh",
    "Gia Bao",
    "Duc Anh",
    "Hoang Long",
    "Thanh Truc",
    "Bao Chau",
    "Quoc Huy",
    "Kim Ngan",
    "Minh Quan",
    "Thu Trang",
]

PROJECT_BLUEPRINTS = [
    {
        "name": "ERP Core Rollout",
        "description": "Consolidate procurement, inventory, finance approvals, and executive reporting into one internal operating backbone.",
        "epics": [
            "Master data governance",
            "Purchase request workflow",
            "Inventory reconciliation",
            "Approval matrix and controls",
            "Executive reporting",
        ],
    },
    {
        "name": "Mobile Commerce 2.0",
        "description": "Improve catalog discovery, checkout speed, and post-purchase visibility for the mobile shopping experience.",
        "epics": [
            "Catalog discovery",
            "Cart and checkout",
            "Payment experience",
            "Order tracking",
            "Retention and push engagement",
        ],
    },
    {
        "name": "Hiring Portal Revamp",
        "description": "Standardize the candidate funnel from job posting to hiring approval with clearer recruiter and interviewer handoffs.",
        "epics": [
            "Job posting workflow",
            "Candidate pipeline",
            "Interview scheduling",
            "Feedback and approvals",
            "Hiring analytics",
        ],
    },
    {
        "name": "Cloud Cost Governance",
        "description": "Bring tagging, observability, backup, and incident readiness under one operating model for platform teams.",
        "epics": [
            "Access baseline",
            "Resource tagging",
            "Cost visibility dashboards",
            "Backup and disaster recovery",
            "Incident readiness",
        ],
    },
    {
        "name": "Employee Self-Service Portal",
        "description": "Give employees one place to manage profile data, leave requests, payslips, and internal support needs.",
        "epics": [
            "Profile management",
            "Leave request flow",
            "Payslip access",
            "Internal announcements",
            "Support ticket routing",
        ],
    },
    {
        "name": "Finance Operations Workspace",
        "description": "Reduce month-end close friction by standardizing invoice intake, approvals, reconciliation, and audit traceability.",
        "epics": [
            "Invoice intake",
            "Approval controls",
            "Payment calendar",
            "Bank reconciliation",
            "Audit trail and evidence",
        ],
    },
    {
        "name": "Warehouse Fulfillment App",
        "description": "Support receiving, pick-pack-ship, stock counting, and exception handling on shared warehouse devices.",
        "epics": [
            "Receiving flow",
            "Pick-pack-ship",
            "Cycle count",
            "Exception handling",
            "Device stability",
        ],
    },
    {
        "name": "Real Estate CRM",
        "description": "Improve how brokers capture leads, track listings, manage follow-ups, and report pipeline health.",
        "epics": [
            "Lead capture",
            "Broker follow-up",
            "Listing inventory",
            "Deal pipeline",
            "Commission reporting",
        ],
    },
    {
        "name": "Booking Platform Refresh",
        "description": "Stabilize availability search, booking confirmation, payment settlement, and support tooling for reservation teams.",
        "epics": [
            "Availability search",
            "Booking confirmation",
            "Payment settlement",
            "Cancellation policy",
            "Support tooling",
        ],
    },
    {
        "name": "Payment Gateway Connector",
        "description": "Build a reusable connector layer for partner payment providers with stronger retries, reconciliation, and alerting.",
        "epics": [
            "Gateway onboarding",
            "Authorization flow",
            "Webhook processing",
            "Reconciliation jobs",
            "Operational alerting",
        ],
    },
    {
        "name": "Internal Social Network",
        "description": "Create a lightweight employee community space for updates, collaboration, recognition, and knowledge sharing.",
        "epics": [
            "News feed",
            "Groups and communities",
            "Recognition flow",
            "Knowledge posts",
            "Moderation controls",
        ],
    },
    {
        "name": "Learning Management Platform",
        "description": "Support course assignment, progress tracking, quizzes, and completion reporting for internal enablement programs.",
        "epics": [
            "Course catalog",
            "Enrollment flow",
            "Learning progress",
            "Assessments and quizzes",
            "Completion reporting",
        ],
    },
    {
        "name": "AI Support Copilot",
        "description": "Help support teams answer faster with guided search, response drafts, knowledge retrieval, and handoff controls.",
        "epics": [
            "Knowledge retrieval",
            "Response drafting",
            "Escalation handoff",
            "Conversation audit",
            "Prompt and safety controls",
        ],
    },
    {
        "name": "Data Warehouse Reporting Hub",
        "description": "Unify source ingestion, metric definitions, dashboard publishing, and access governance for reporting consumers.",
        "epics": [
            "Source ingestion",
            "Metric definitions",
            "Dashboard publishing",
            "Access governance",
            "Data quality monitoring",
        ],
    },
    {
        "name": "Delivery Control Tower",
        "description": "Give operations one place to monitor rider capacity, live orders, SLA risk, and exception workflows.",
        "epics": [
            "Order intake",
            "Rider assignment",
            "Live tracking",
            "SLA escalation",
            "Exception workflows",
        ],
    },
    {
        "name": "Air Ticketing Web",
        "description": "Improve search, fare rules, booking, ancillaries, and after-sales support across the airline booking journey.",
        "epics": [
            "Fare search",
            "Booking flow",
            "Ancillary services",
            "After-sales changes",
            "Refund handling",
        ],
    },
    {
        "name": "Server Admin Toolkit",
        "description": "Give platform engineers better automation for inventory, patching, runtime checks, and incident investigation.",
        "epics": [
            "Server inventory",
            "Patch orchestration",
            "Runtime diagnostics",
            "Access controls",
            "Incident investigation",
        ],
    },
    {
        "name": "Streaming Platform",
        "description": "Strengthen ingest, playback, moderation, and analytics for a stable live and on-demand streaming experience.",
        "epics": [
            "Content ingest",
            "Playback quality",
            "Creator tools",
            "Moderation and safety",
            "Audience analytics",
        ],
    },
    {
        "name": "Clinic Operations Suite",
        "description": "Standardize patient registration, appointment flow, billing, and medical record visibility for clinic staff.",
        "epics": [
            "Patient registration",
            "Appointment scheduling",
            "Clinical notes flow",
            "Billing operations",
            "Follow-up reminders",
        ],
    },
    {
        "name": "Event Ticketing Platform",
        "description": "Support ticket sales, seat maps, QR validation, refunds, and event-day operations with less manual coordination.",
        "epics": [
            "Ticket catalog",
            "Seat selection",
            "Purchase and payment",
            "QR validation",
            "Refund and support",
        ],
    },
]

SPRINT_PHASES = [
    "Discovery",
    "Core Build",
    "Integration",
    "UAT and Rollout",
]

TASK_PRIORITIES = ["medium", "high", "high", "medium", "low"]
TASK_ESTIMATES = [8, 12, 16, 10, 6]
EPIC_ESTIMATES = [40, 36, 42, 34, 30]


def _employee_name(index: int) -> str:
    family = EMPLOYEE_FAMILIES[index % len(EMPLOYEE_FAMILIES)]
    given = EMPLOYEE_GIVEN_NAMES[(index // len(EMPLOYEE_FAMILIES)) % len(EMPLOYEE_GIVEN_NAMES)]
    return f"{family} {given}"


def _short_label(value: str | None) -> str:
    if not value:
        return "this item"
    return value.replace("[Epic] ", "").strip()


def _rewrite_departments(db: Session, departments: Iterable[Department]) -> list[Department]:
    department_list = list(departments)

    for department in department_list:
        department.name = f"tmp-department-{department.id}"

    db.flush()

    for index, department in enumerate(department_list):
        department.name = DEPARTMENT_NAMES[index % len(DEPARTMENT_NAMES)]
    return department_list


def _rewrite_users(users: Iterable[User], departments: list[Department]) -> None:
    role_to_department_index = {
        "ADMIN": [4, 5, 9],
        "MANAGER": [1, 4, 6],
        "LEADER": [0, 2, 3],
        "MEMBER": [0, 2, 3, 6, 7, 8],
    }

    department_ids = [department.id for department in departments]
    if not department_ids:
        return

    for index, user in enumerate(users):
        user.full_name = _employee_name(index)
        user.phone_number = f"090{index + 200:07d}"

        department_rotation = role_to_department_index.get(user.role or "MEMBER", [0])
        target_index = department_rotation[index % len(department_rotation)] % len(department_ids)
        user.department_id = department_ids[target_index]


def _status_for_project(project_status: str, sprint_index: int) -> str:
    if project_status == "completed":
        return "completed"
    if project_status == "inactive":
        return "completed" if sprint_index == 0 else "planning"
    if project_status == "at_risk":
        if sprint_index == 0:
            return "completed"
        if sprint_index == 1:
            return "active"
        return "planning"
    if sprint_index < 2:
        return "completed"
    if sprint_index == 2:
        return "active"
    return "planning"


def _rewrite_sprints(project: Project, sprints: list[Sprint], blueprint: dict[str, object]) -> None:
    epic_names = blueprint["epics"]
    for index, sprint in enumerate(sprints):
        sprint.status = _status_for_project(project.status, index)
        sprint.name = f"Sprint {index + 1:02d} - {SPRINT_PHASES[index % len(SPRINT_PHASES)]}"
        focus_epic = epic_names[min(index, len(epic_names) - 1)]
        sprint.goal = f"Deliver a stable increment for {focus_epic.lower()} in {project.name}."

        if sprint.status == "completed":
            sprint.review_note = (
                f"Closed after smoke test, PM review, and handover notes for {focus_epic.lower()}."
            )
        elif sprint.status == "active":
            sprint.review_note = (
                f"Current sprint is focused on {focus_epic.lower()} with close tracking on dependencies and QA readiness."
            )
        else:
            sprint.review_note = (
                f"Backlog and technical approach for {focus_epic.lower()} are prepared for the next planning session."
            )


def _epic_status_for_sprint(sprint_status: str) -> str:
    if sprint_status == "completed":
        return "done"
    if sprint_status == "active":
        return "in_progress"
    return "todo"


def _task_status_for_sprint(sprint_status: str, task_index: int) -> str:
    if sprint_status == "completed":
        return "done"
    if sprint_status == "active":
        active_statuses = ["done", "in_progress", "in_progress", "todo", "todo"]
        return active_statuses[task_index % len(active_statuses)]
    return "todo"


def _subtask_status_for_parent(parent_status: str, subtask_index: int) -> str:
    if parent_status == "done":
        return "done"
    if parent_status == "in_progress":
        return "done" if subtask_index == 0 else "in_progress"
    return "todo"


def _build_task_templates(epic_name: str, project_name: str) -> list[dict[str, object]]:
    return [
        {
            "title": f"Finalize scope and acceptance criteria for {epic_name}",
            "description": f"Document the current process, pain points, and acceptance criteria for the {epic_name.lower()} scope in {project_name}.",
        },
        {
            "title": f"Design data model and API contracts for {epic_name}",
            "description": f"Define request payloads, response mapping, and validation rules needed to support {epic_name.lower()} in {project_name}.",
        },
        {
            "title": f"Implement service logic and permission rules for {epic_name}",
            "description": f"Build the main backend flow for {epic_name.lower()}, including state changes, audit coverage, and permission checks.",
        },
        {
            "title": f"Build UI flow and edge states for {epic_name}",
            "description": f"Complete list, detail, empty, loading, and error states for the {epic_name.lower()} journey in {project_name}.",
        },
        {
            "title": f"Run QA, rollout checks, and handover for {epic_name}",
            "description": f"Prepare test cases, verify staging behavior, and document release and support notes for {epic_name.lower()}.",
        },
    ]


def _build_subtask_templates(epic_name: str, task_index: int) -> list[dict[str, object]]:
    templates = [
        [
            {
                "title": f"Review current pain points for {epic_name}",
                "description": f"Collect examples from current operations and summarize the main failure points for {epic_name.lower()}.",
            },
            {
                "title": f"Capture acceptance criteria for {epic_name}",
                "description": f"List the main business rules and sign-off checkpoints required before implementation starts for {epic_name.lower()}.",
            },
        ],
        [
            {
                "title": f"Draft request and response contract for {epic_name}",
                "description": f"Write the payload structure, required fields, and response mapping for the {epic_name.lower()} API flow.",
            },
            {
                "title": f"Add validation and error mapping for {epic_name}",
                "description": f"Define validation rules and user-facing error messages for common failure cases in {epic_name.lower()}.",
            },
        ],
        [
            {
                "title": f"Implement persistence and business rules for {epic_name}",
                "description": f"Cover create, update, and transition rules for {epic_name.lower()} with the expected database side effects.",
            },
            {
                "title": f"Handle edge cases and role checks for {epic_name}",
                "description": f"Close edge cases, duplicate submissions, and role-based access gaps for the {epic_name.lower()} service layer.",
            },
        ],
        [
            {
                "title": f"Build form and list states for {epic_name}",
                "description": f"Implement the primary screens and basic empty, loading, and error states for the {epic_name.lower()} flow.",
            },
            {
                "title": f"Wire notifications and loading states for {epic_name}",
                "description": f"Finish success feedback, inline validation, and loading behavior across the {epic_name.lower()} journey.",
            },
        ],
        [
            {
                "title": f"Prepare test cases and release checklist for {epic_name}",
                "description": f"Document smoke tests, rollback notes, and dependencies that must be checked before releasing {epic_name.lower()}.",
            },
            {
                "title": f"Fix staging defects and handover notes for {epic_name}",
                "description": f"Close final staging gaps and update handover notes so support and QA can track the {epic_name.lower()} release safely.",
            },
        ],
    ]
    return templates[task_index % len(templates)]


def _rewrite_tasks(project: Project, project_tasks: list[Task], project_sprints: list[Sprint], blueprint: dict[str, object]) -> None:
    children_by_parent: dict[int, list[Task]] = defaultdict(list)
    epics = []

    for task in project_tasks:
        if task.parent_task_id is None:
            epics.append(task)
        else:
            children_by_parent[task.parent_task_id].append(task)

    for task_list in children_by_parent.values():
        task_list.sort(key=lambda item: item.id)

    epics.sort(key=lambda item: item.id)
    sprint_rotation = [
        project_sprints[min(index, len(project_sprints) - 1)] if project_sprints else None
        for index in range(max(len(epics), 1))
    ]

    epic_names = blueprint["epics"]

    for epic_index, epic in enumerate(epics):
        sprint = sprint_rotation[epic_index] if sprint_rotation else None
        epic_name = epic_names[epic_index % len(epic_names)]
        sprint_status = sprint.status if sprint else "planning"

        epic.title = f"[Epic] {epic_name}"
        epic.description = (
            f"Own the {epic_name.lower()} scope for {project.name} and deliver a stable flow that business stakeholders can review with confidence."
        )
        epic.priority = "critical" if epic_index == 0 else "high"
        epic.status = _epic_status_for_sprint(sprint_status)
        epic.sprint_id = sprint.id if sprint else None
        epic.deadline = sprint.end_date if sprint else epic.deadline
        epic.estimated_hours = EPIC_ESTIMATES[epic_index % len(EPIC_ESTIMATES)]

        child_tasks = children_by_parent.get(epic.id, [])
        task_templates = _build_task_templates(epic_name, project.name)

        for task_index, task in enumerate(child_tasks):
            task_template = task_templates[task_index % len(task_templates)]
            task.title = task_template["title"]
            task.description = task_template["description"]
            task.priority = TASK_PRIORITIES[task_index % len(TASK_PRIORITIES)]
            task.status = _task_status_for_sprint(sprint_status, task_index)
            task.sprint_id = sprint.id if sprint else None
            task.deadline = (
                sprint.end_date - timedelta(days=max(0, 4 - task_index))
                if sprint and sprint.end_date
                else task.deadline
            )
            task.estimated_hours = TASK_ESTIMATES[task_index % len(TASK_ESTIMATES)]

            subtasks = children_by_parent.get(task.id, [])
            subtask_templates = _build_subtask_templates(epic_name, task_index)

            for subtask_index, subtask in enumerate(subtasks):
                subtask_template = subtask_templates[subtask_index % len(subtask_templates)]
                subtask.title = subtask_template["title"]
                subtask.description = subtask_template["description"]
                subtask.priority = "medium" if subtask_index == 0 else "low"
                subtask.status = _subtask_status_for_parent(task.status, subtask_index)
                subtask.sprint_id = task.sprint_id
                subtask.deadline = task.deadline
                subtask.estimated_hours = 4 if subtask_index == 0 else 3


def _comment_for_task(task: Task | None, index: int) -> str:
    label = _short_label(task.title if task else None)
    status = task.status if task else "todo"

    if status == "done":
        templates = [
            f"{label} is already on staging and passed smoke test with QA.",
            f"Main scenarios for {label} are complete. Keep monitoring one more release window for regressions.",
            f"Handover for {label} is ready. PM can include it in the next stakeholder demo.",
        ]
    elif status == "in_progress":
        templates = [
            f"Backend flow for {label} is in progress. Remaining work is validation and loading states.",
            f"Team aligned the API payload for {label}. Frontend is wiring the main path on staging.",
            f"Current blocker on {label} is data mapping from the legacy flow. Fix is planned for today.",
        ]
    else:
        templates = [
            f"Acceptance criteria for {label} are drafted and waiting for PM sign-off on edge cases.",
            f"Dependencies for {label} are listed. Dev can start once upstream input is confirmed.",
            f"{label} is ready for implementation after the next grooming session closes open questions.",
        ]

    return templates[index % len(templates)]


def _logwork_for_task(task: Task | None, index: int) -> tuple[str, str | None, float, float]:
    label = _short_label(task.title if task else None)
    status = task.status if task else "todo"

    if status == "done":
        work = f"Completed service logic, staging verification, and final handover notes for {label}."
        comment = "No open issues after smoke test."
        progress = 100.0
        hours = float([2, 3, 4, 5][index % 4])
    elif status == "in_progress":
        work = f"Reviewed the current flow, updated API validation, and continued UI wiring for {label}."
        comment = "Waiting on one dependency before closing the remaining edge cases."
        progress = float([35, 50, 65, 80][index % 4])
        hours = float([2, 3, 4, 4][index % 4])
    else:
        work = f"Prepared the implementation checklist, risk notes, and dependency list for {label}."
        comment = "Implementation has not started yet."
        progress = float([10, 15, 20][index % 3])
        hours = float([1, 1, 2][index % 3])

    return work, comment, progress, hours


def rewrite_demo_content(db: Session) -> dict[str, int]:
    departments = _rewrite_departments(db, db.query(Department).order_by(Department.id).all())
    users = db.query(User).order_by(User.id).all()
    projects = db.query(Project).order_by(Project.id).all()
    sprints = db.query(Sprint).order_by(Sprint.project_id, Sprint.start_date, Sprint.id).all()
    tasks = db.query(Task).order_by(Task.project_id, Task.id).all()
    comments = db.query(TaskComment).order_by(TaskComment.id).all()
    logworks = db.query(LogWork).order_by(LogWork.id).all()

    _rewrite_users(users, departments)

    sprints_by_project: dict[int, list[Sprint]] = defaultdict(list)
    tasks_by_project: dict[int, list[Task]] = defaultdict(list)

    for sprint in sprints:
        sprints_by_project[sprint.project_id].append(sprint)

    for task in tasks:
        tasks_by_project[task.project_id].append(task)

    for index, project in enumerate(projects):
        blueprint = PROJECT_BLUEPRINTS[index % len(PROJECT_BLUEPRINTS)]
        project.name = blueprint["name"]
        project.description = blueprint["description"]

        project_sprints = sprints_by_project.get(project.id, [])
        _rewrite_sprints(project, project_sprints, blueprint)

        project_tasks = tasks_by_project.get(project.id, [])
        _rewrite_tasks(project, project_tasks, project_sprints, blueprint)

    tasks_by_id = {task.id: task for task in tasks}

    for index, comment in enumerate(comments):
        comment.content = _comment_for_task(tasks_by_id.get(comment.task_id), index)

    for index, logwork in enumerate(logworks):
        work_content, comment, progress_percent, hours_spent = _logwork_for_task(
            tasks_by_id.get(logwork.task_id),
            index,
        )
        logwork.work_content = work_content
        logwork.comment = comment
        logwork.progress_percent = progress_percent
        logwork.hours_spent = hours_spent

    db.commit()

    return {
        "departments": len(departments),
        "users": len(users),
        "projects": len(projects),
        "sprints": len(sprints),
        "tasks": len(tasks),
        "comments": len(comments),
        "logworks": len(logworks),
    }
