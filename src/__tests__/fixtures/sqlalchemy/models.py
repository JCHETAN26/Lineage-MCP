"""SQLAlchemy fixture: covers the patterns that broke the Airflow real-world scan.

- Plain `class X(Base)` with explicit `__tablename__`
- `class Y(DeclarativeBase)` 2.x style
- `class Z(db.Model)` Flask-SQLAlchemy
- Anti-pattern: `BaseModel` (Pydantic) MUST NOT be flagged as a table
"""

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import DeclarativeBase, mapped_column
from pydantic import BaseModel


class Base(DeclarativeBase):
    pass


class TaskInstance(Base):
    __tablename__ = "task_instance"
    id = Column(Integer, primary_key=True)
    dag_id = Column(String(250))
    state = Column(String(20))
    created_at = Column(DateTime)


class DagRun(Base):
    __tablename__ = "dag_run"
    id: int = mapped_column(Integer, primary_key=True)
    run_id: str = mapped_column(String(250))


# Inherits from db.Model — Flask-SQLAlchemy style, but uses class name as
# table since no __tablename__ override.
class UserSession(db.Model):
    id = Column(Integer, primary_key=True)
    token = Column(String(64))


# NOT a table — Pydantic. Must not be registered.
class WebhookPayload(BaseModel):
    event: str
    data: dict
