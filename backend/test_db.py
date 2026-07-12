from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.project_model import ProjectMember

engine = create_engine("mysql+pymysql://root:root@localhost:3306/pm_system")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

members = db.query(ProjectMember).all()
for m in members:
    print(f"ID: {m.id}, is_active: {m.is_active}")
