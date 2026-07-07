from sqlalchemy import Column, Integer, String

from app.core.connection import Base


class Department(Base):
    __tablename__ = "departments"

    id = Column(
        Integer, primary_key=True, autoincrement=True, nullable=False, index=True
    )
    name = Column(String(255), nullable=False, unique=True)
