from sqlalchemy import Column, String, Integer, Datetime
from database.connection import Base
from datetime import datetime


class Task(Base):
    id = Column(String, PrimaryKey)
