import sys
from datetime import datetime, timezone
from app.core.connection import SessionLocal
from app.models.task_model import Task
from sqlalchemy import select, and_, func, or_

db = SessionLocal()
effective_deadline = func.coalesce(Task.deadline, Task.start_date)
query = select(Task).where(
    Task.project_id == 10,
    Task.status != "done",
    effective_deadline != None,
    effective_deadline < datetime.now(timezone.utc).date()
)
tasks = db.execute(query).scalars().all()
for t in tasks:
    print(t.id, t.title, t.status, t.deadline)
