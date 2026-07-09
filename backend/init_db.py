from app.core.connection import Base, engine, SessionLocal
from app.models.user_model import User
from app.models.department_model import Department
from app.models.project_model import Project, ProjectMember
from app.models.sprint_model import Sprint
from app.models.task_model import Task, TaskComment
from app.models.logworks import LogWork
from app.models.refresh_token_model import RefreshToken
from app.models.ai_model import AiConversation, AiMessage
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Tables created.")

db = SessionLocal()
try:
    if not db.query(User).filter(User.email == "thach@gmail.com").first():
        user = User(
            email="thach@gmail.com",
            password_hash=pwd_context.hash("password123"),
            full_name="Bao Thach",
            is_active=True,
            is_admin=True,
            role="ADMIN"
        )
        db.add(user)
        db.commit()
        print("Seeded user: thach@gmail.com")
finally:
    db.close()
