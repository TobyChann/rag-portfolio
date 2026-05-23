from sqlalchemy import Column, String, Integer, Text, DateTime, Enum, ARRAY, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
import enum

from app.db.database import Base


class VisitorRole(str, enum.Enum):
    recruiter = "recruiter"
    hiring_manager = "hiring_manager"
    peer = "peer"
    curious = "curious"


class FeedbackValue(int, enum.Enum):
    thumbs_up = 1
    none = 0
    thumbs_down = -1


class Visitor(Base):
    __tablename__ = "visitors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(String, unique=True, index=True)
    role = Column(Enum(VisitorRole), nullable=True)
    industry = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    referrer = Column(String, nullable=True)          # ?ref=linkedin etc
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Query(Base):
    __tablename__ = "queries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(String, index=True)           # FK to visitors.session_id
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    chunks_used = Column(JSON, nullable=True)          # [{doc, page, score}]
    response_ms = Column(Integer, nullable=True)
    feedback = Column(Integer, default=0)             # 1, 0, -1
    cache_hit = Column(String, nullable=True)         # "redis" | "zilliz" | null
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    google_doc_id = Column(String, unique=True, index=True)
    title = Column(String, nullable=False)
    topic = Column(String, nullable=True)             # e.g. "Databases"
    chunk_count = Column(Integer, default=0)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Course(Base):
    __tablename__ = "courses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    institution = Column(String, nullable=True)
    year = Column(Integer, nullable=True)
    summary = Column(Text, nullable=True)
    topics = Column(ARRAY(String), default=[])
    google_doc_id = Column(String, nullable=True)     # link to source doc
    created_at = Column(DateTime(timezone=True), server_default=func.now())
