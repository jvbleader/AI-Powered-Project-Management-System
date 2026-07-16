import sys
import os

# Add backend to path to import app modules
sys.path.append(os.path.join(os.path.dirname(__file__), '../backend'))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.user_model import User

DATABASE_URL = "mysql+pymysql://flowpilot:flowpilot123@127.0.0.1:3307/flowpilot"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def fetch_users():
    db = SessionLocal()
    users = db.query(User).all()
    print("Total users:", len(users))
    for u in users[:10]:
        print(f"ID: {u.id}, Name: {u.full_name}, Email: {u.email}, Role: {u.role}")
    db.close()

if __name__ == "__main__":
    fetch_users()
