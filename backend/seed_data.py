import random
import datetime
import bcrypt
from faker import Faker

from app.core.connection import SessionLocal, engine, Base
from app.models.user_model import User
from app.models.department_model import Department
from app.models.project_model import Project, ProjectMember, Role, ProjectStatus
from app.models.sprint_model import Sprint
from app.models.task_model import Task, TaskAssignees, TaskComment
from app.models.logworks import LogWork
from app.models.refresh_token_model import RefreshToken
from app.demo_content import rewrite_demo_content

fake = Faker('vi_VN')

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

from sqlalchemy import text

def clear_data(db):
    print("Xóa dữ liệu cũ...")
    # Tắt kiểm tra khóa ngoại (chỉ dùng cho MySQL)
    db.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
    
    db.query(LogWork).delete()
    db.query(TaskComment).delete()
    db.query(TaskAssignees).delete()
    db.query(Task).delete()
    db.query(Sprint).delete()
    db.query(ProjectMember).delete()
    db.query(Project).delete()
    db.query(RefreshToken).delete()
    db.query(User).delete()
    db.query(Department).delete()
    db.query(Role).delete()
    
    db.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
    db.commit()

def seed():
    db = SessionLocal()
    clear_data(db)

    print("Đang sinh dữ liệu mới...")
    
    # 1. Departments
    dept_names = ["Engineering", "Design", "Product", "QA", "Marketing", "Sales", "HR", "Finance", "Operations", "Customer Success"]
    departments = []
    for name in dept_names:
        d = Department(name=name)
        db.add(d)
        departments.append(d)
    db.commit()

    # 2. Roles
    role_names = ["Admin", "Project Manager", "Leader", "Team Member"]
    roles = []
    for name in role_names:
        r = Role(name=name)
        db.add(r)
        roles.append(r)
    db.commit()

    # 3. Users (100 users)
    users = []
    pwd_hash = hash_password("123456")
    
    for i in range(100):
        # Xác định vai trò
        if i < 2:
            role_obj = roles[0] # Admin
            role_str = "ADMIN"
            is_admin = True
        elif i < 15:
            role_obj = roles[1] # PM
            role_str = "MANAGER"
            is_admin = False
        elif i < 35:
            role_obj = roles[2] # Leader
            role_str = "LEADER"
            is_admin = False
        else:
            role_obj = roles[3] # Team Member
            role_str = "MEMBER"
            is_admin = False
            
        u = User(
            full_name=fake.name(),
            email=f"user{i}@example.com" if i > 0 else "admin@example.com",
            phone_number=fake.phone_number()[:20],
            password_hash=pwd_hash,
            department_id=random.choice(departments).id,
            role=role_str,
            is_active=True,
            is_admin=is_admin
        )
        db.add(u)
        users.append({'user': u, 'role_id': role_obj.id})
    db.commit()

    # 4. Projects (20 projects)
    projects = []
    project_names = [
        "Hệ thống ERP nội bộ", "Ứng dụng Mobile E-commerce", "Website Tuyển dụng", 
        "Nâng cấp hạ tầng Cloud", "Cổng thông tin nhân viên", "Phần mềm Kế toán V2",
        "App Quản lý Kho", "CRM Bất động sản", "Hệ thống Booking Online",
        "Tích hợp API Thanh toán", "Mạng xã hội Doanh nghiệp", "Nền tảng e-Learning",
        "Hệ thống Chatbot AI", "Phân tích Dữ liệu BigData", "App Giao hàng",
        "Website Bán vé Máy bay", "Công cụ Quản trị Server", "Nền tảng Streaming",
        "Phần mềm Quản lý Phòng khám", "Hệ thống Vé điện tử"
    ]
    
    for i in range(20):
        status = random.choices(
            ['active', 'inactive', 'completed', 'at_risk'], 
            weights=[60, 10, 20, 10]
        )[0]
        p = Project(
            name=project_names[i],
            description=fake.text(),
            status=status,
            start_date=fake.date_between(start_date='-60d', end_date='-30d'),
            end_date=fake.date_between(start_date='+30d', end_date='+90d') if status != 'completed' else fake.date_between(start_date='-10d', end_date='today'),
            created_by=users[0]['user'].id
        )
        db.add(p)
        projects.append(p)
    db.commit()

    # 5. Project Members
    all_members = []
    for p in projects:
        size_type = random.choice(['small', 'medium', 'large'])
        if size_type == 'small': num = random.randint(3, 5)
        elif size_type == 'medium': num = random.randint(10, 20)
        else: num = random.randint(30, 50)
        
        # Chọn PM
        pm_candidates = [u for u in users if u['role_id'] == roles[1].id]
        pm = random.choice(pm_candidates)
        # Chọn Leader
        leader_candidates = [u for u in users if u['role_id'] == roles[2].id]
        leader = random.choice(leader_candidates)
        
        # Các user khác
        other_users = random.sample(users, num)
        if pm not in other_users: other_users.append(pm)
        if leader not in other_users: other_users.append(leader)
        
        for u in other_users:
            role_id = u['role_id']
            # Chắc chắn ít nhất 1 PM và 1 Leader cho dự án (nếu ngẫu nhiên ko trúng)
            if u == pm: role_id = roles[1].id
            if u == leader: role_id = roles[2].id
            
            pmem = ProjectMember(
                project_id=p.id,
                user_id=u['user'].id,
                role_id=role_id
            )
            db.add(pmem)
            all_members.append(pmem)
    db.commit()

    # 6. Sprints
    sprints = []
    for p in projects:
        for s_idx in range(4):
            sprint_status = "planning"
            if s_idx == 0: sprint_status = "completed"
            elif s_idx == 1: sprint_status = "active"
            
            start_dt = p.start_date + datetime.timedelta(days=s_idx*14)
            end_dt = start_dt + datetime.timedelta(days=14)
            
            p_members = [m for m in all_members if m.project_id == p.id]
            creator = random.choice(p_members) if p_members else None
            
            if not creator: continue
            
            sp = Sprint(
                project_id=p.id,
                name=f"Sprint {s_idx + 1}",
                goal=fake.sentence(),
                start_date=start_dt,
                end_date=end_dt,
                status=sprint_status,
                created_by_member_id=creator.id
            )
            db.add(sp)
            sprints.append(sp)
    db.commit()

    # 7. Tasks & Hierarchy (75 tasks / project)
    statuses = ['todo', 'in_progress', 'done']
    priorities = ['low', 'medium', 'high', 'critical']
    
    total_tasks_created = 0
    for p in projects:
        p_members = [m for m in all_members if m.project_id == p.id]
        if not p_members: continue
        p_sprints = [s for s in sprints if s.project_id == p.id]
        
        # Tạo Epic
        for epic_idx in range(5):
            creator = random.choice(p_members)
            epic = Task(
                project_id=p.id,
                sprint_id=random.choice(p_sprints).id if p_sprints else None,
                parent_task_id=None,
                title=f"[Epic] {fake.sentence()[:100]}",
                description=fake.text(),
                created_by_member_id=creator.id,
                status=random.choice(statuses),
                priority=random.choice(priorities),
                deadline=fake.date_between(start_date='today', end_date='+30d'),
                estimated_hours=random.randint(20, 100)
            )
            db.add(epic)
            db.commit()
            
            # Tạo Task
            for task_idx in range(5):
                creator_t = random.choice(p_members)
                task = Task(
                    project_id=p.id,
                    sprint_id=epic.sprint_id,
                    parent_task_id=epic.id,
                    title=f"Task {task_idx+1}: {fake.sentence()[:100]}",
                    description=fake.text(),
                    created_by_member_id=creator_t.id,
                    status=random.choice(statuses),
                    priority=random.choice(priorities),
                    deadline=epic.deadline,
                    estimated_hours=random.randint(5, 20)
                )
                db.add(task)
                db.commit()
                
                # Tạo Subtask
                for sub_idx in range(2):
                    creator_s = random.choice(p_members)
                    status_s = random.choice(statuses)
                    sub = Task(
                        project_id=p.id,
                        sprint_id=task.sprint_id,
                        parent_task_id=task.id,
                        title=f"Subtask {sub_idx+1}: {fake.sentence()[:100]}",
                        description=fake.text(),
                        created_by_member_id=creator_s.id,
                        status=status_s,
                        priority=random.choice(priorities),
                        deadline=task.deadline,
                        estimated_hours=random.randint(1, 5)
                    )
                    db.add(sub)
                    db.commit()
                    
                    # 8. Assignees, Comments, Logworks cho subtasks
                    assignee = random.choice(p_members)
                    # Assignee
                    ta = TaskAssignees(
                        task_id=sub.id,
                        project_member_id=assignee.id,
                        assigned_by_member_id=creator_s.id
                    )
                    db.add(ta)
                    
                    # Comment
                    if random.random() > 0.5:
                        tc = TaskComment(
                            task_id=sub.id,
                            project_member_id=assignee.id,
                            content=fake.sentence()
                        )
                        db.add(tc)
                        
                    # Logwork
                    if status_s in ['in_progress', 'done']:
                        lw = LogWork(
                            task_id=sub.id,
                            project_member_id=assignee.id,
                            work_date=fake.date_between(start_date='-10d', end_date='today'),
                            hours_spent=random.randint(1, 5),
                            work_content=fake.sentence(),
                            progress_percent=100 if status_s == 'done' else random.randint(10, 90)
                        )
                        db.add(lw)
            db.commit()
        
        total_tasks_created += 75
        print(f"Đã tạo 75 tasks cho project {p.name}")

    summary = rewrite_demo_content(db)
    print(f"Da lam sach noi dung demo cho {summary['users']} users, {summary['projects']} projects va {summary['tasks']} tasks.")
    print(f"Hoàn thành! Đã tạo {total_tasks_created} tasks.")
    db.close()

if __name__ == "__main__":
    seed()
