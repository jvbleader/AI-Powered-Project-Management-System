from app.core.connection import SessionLocal
from app.models.project_model import ProjectMember
from app.models.task_model import Task, TaskAssignees

db = SessionLocal()
assignees = (
    db.query(Task.id, Task.title, Task.status, Task.parent_task_id)
    .join(TaskAssignees, Task.id == TaskAssignees.task_id)
    .join(ProjectMember, ProjectMember.id == TaskAssignees.project_member_id)
    .filter(ProjectMember.user_id == 1)
    .all()
)

print(f"Total assigned tasks: {len(assignees)}")

for a in assignees:
    print(f"Task {a.id}: {a.status} (parent: {a.parent_task_id})")
