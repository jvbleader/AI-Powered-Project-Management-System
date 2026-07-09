from app.core.connection import SessionLocal, engine
from app.models.user_model import User
db = SessionLocal()
for u in db.query(User).limit(10).all():
    print(u.id, u.email, u.role, u.is_admin)
