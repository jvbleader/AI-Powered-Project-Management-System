from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.project_model import ProjectMember
from app.core.config import settings

engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

member = db.query(ProjectMember).first()
if member:
    print(f"Member ID: {member.id}, is_active: {member.is_active}")
    member.is_active = False
    db.commit()
    print("Successfully set is_active to False without IntegrityError!")
else:
    print("No members found")
