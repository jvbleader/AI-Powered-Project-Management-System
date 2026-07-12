import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.project_model import ProjectMember
from app.core.config import settings

engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

member = db.query(ProjectMember).first()
if member:
    print(f"Trying to delete member {member.id}")
    try:
        db.delete(member)
        db.commit()
        print("Success!")
    except Exception as e:
        print("Failed:", e)
else:
    print("No members found")
