import sys
import os
import random
from datetime import datetime, timedelta, timezone

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.connection import SessionLocal
from app.models.project_model import Project, ProjectMember, Role
from app.models.user_model import User
from app.models.task_model import Task, TaskAssignees
from app.models.sprint_model import Sprint

def run_import():
    db = SessionLocal()
    try:
        # Find all users
        users = db.query(User).all()
        if not users:
            print("No users found in database.")
            return

        admin_user = users[0]

        # Find or create project
        project_name = "AI-Powered Project Management System"
        project = db.query(Project).filter(Project.name == project_name).first()
        if not project:
            print(f"Creating project '{project_name}'...")
            project = Project(
                name=project_name,
                description="Project to practice PM tools",
                status="active",
                start_date=datetime.now(timezone.utc).date(),
                end_date=(datetime.now(timezone.utc) + timedelta(days=90)).date(),
                created_by=admin_user.id
            )
            db.add(project)
            db.commit()
            db.refresh(project)
        else:
            print(f"Project '{project_name}' found. ID: {project.id}")

        # Ensure role exists
        pm_role = db.query(Role).filter(Role.name == "Project Manager").first()
        member_role = db.query(Role).filter(Role.name == "Team Member").first()
        
        # Ensure project members
        for user in users:
            member = db.query(ProjectMember).filter(ProjectMember.project_id == project.id, ProjectMember.user_id == user.id).first()
            if not member:
                role_id = pm_role.id if user.id == admin_user.id else member_role.id
                db.add(ProjectMember(project_id=project.id, user_id=user.id, role_id=role_id))
        db.commit()

        project_members = db.query(ProjectMember).filter(ProjectMember.project_id == project.id).all()
        member_ids = [m.id for m in project_members]
        pm_member = next((m for m in project_members if m.user_id == admin_user.id), project_members[0])

        with open("tasks_data.tsv", "r", encoding="utf-8") as f:
            lines = f.readlines()

        current_epic = ""
        current_parent_task_id = None

        count = 0
        for line in lines:
            line = line.strip('\n')
            if not line:
                continue
            cols = line.split('\t')
            
            col1 = cols[0].strip() if len(cols) > 0 else ""
            col2 = cols[1].strip() if len(cols) > 1 else ""
            col3 = cols[2].strip() if len(cols) > 2 else ""

            # Remove quotes
            col1 = col1.strip('"')
            col2 = col2.strip('"')
            col3 = col3.strip('"')

            if col1:
                current_epic = col1
            
            if col2:
                # Create Parent Task
                title = f"[{current_epic}] {col2}" if current_epic else col2
                task = Task(
                    project_id=project.id,
                    title=title[:255],
                    description=f"Parent task for {col2}",
                    created_by_member_id=pm_member.id,
                    status="todo",
                    priority="high",
                    start_date=datetime.now(timezone.utc).date(),
                    deadline=(datetime.now(timezone.utc) + timedelta(days=30)).date(),
                    estimated_hours=random.randint(10, 40)
                )
                db.add(task)
                db.flush() # To get ID
                current_parent_task_id = task.id
                count += 1
                print(f"Created Parent Task: {title}")

            if col3:
                # Create Subtask
                if not current_parent_task_id:
                    continue
                
                status = random.choice(["todo", "in_progress", "done"])
                estimated_hours = random.randint(2, 10)
                subtask = Task(
                    project_id=project.id,
                    parent_task_id=current_parent_task_id,
                    title=col3[:255],
                    description=col3,
                    created_by_member_id=pm_member.id,
                    status=status,
                    priority=random.choice(["low", "medium", "high"]),
                    start_date=datetime.now(timezone.utc).date(),
                    deadline=(datetime.now(timezone.utc) + timedelta(days=14)).date(),
                    estimated_hours=estimated_hours
                )
                if status == "done":
                    subtask.completed_at = datetime.now(timezone.utc)

                db.add(subtask)
                db.flush()
                count += 1
                
                # Randomly assign
                assign = random.choice([True, True, False])
                if assign:
                    assignee_id = random.choice(member_ids)
                    task_assignee = TaskAssignees(
                        task_id=subtask.id,
                        project_member_id=assignee_id,
                        assigned_by_member_id=pm_member.id
                    )
                    db.add(task_assignee)

        db.commit()
        print(f"Successfully imported {count} tasks/subtasks into project '{project_name}'!")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_import()
