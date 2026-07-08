from sqlalchemy import Column, String, Integer, Text, DateTime, Enum, ARRAY, JSON, Boolean, ForeignKey
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
    referrer = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Query(Base):
    __tablename__ = "queries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(String, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    chunks_used = Column(JSON, nullable=True)
    response_ms = Column(Integer, nullable=True)
    feedback = Column(Integer, default=0)
    cache_hit = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    google_doc_id = Column(String, unique=True, index=True)
    title = Column(String, nullable=False)
    topic = Column(String, nullable=True)
    chunk_count = Column(Integer, default=0)
    skills = Column(ARRAY(String), default=[])
    summary = Column(Text, nullable=True)
    tag_status = Column(String, default="pending")
    needs_review = Column(Boolean, default=False)
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
    google_doc_id = Column(String, nullable=True)        # legacy single link
    linked_doc_ids = Column(ARRAY(String), default=[])   # multiple linked documents
    is_currently_learning = Column(Boolean, default=False)
    is_self_explored = Column(Boolean, default=False)    # outside formal curriculum
    notes = Column(Text, nullable=True)                  # visible note/tag for employer
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HomeContent(Base):
    """Persistent key-value store for editable home page content (replaces Redis)."""
    __tablename__ = "home_content"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    section = Column(String, nullable=False, index=True)   # e.g. "intro", "education"
    field = Column(String, nullable=False, index=True)     # e.g. "name", "bio"
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PipelineConfig(Base):
    """Persistent config for the pipeline diagram bars (project mgmt, db layer, infra)."""
    __tablename__ = "pipeline_config"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bar_id = Column(String, nullable=False, unique=True)  # "top_bar" | "db_layer" | "bottom_bar"
    label = Column(String, nullable=False)
    items = Column(ARRAY(String), default=[])
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ProfileNote(Base):
    """Living background: education, goal, preferences. One row per fact."""
    __tablename__ = "profile_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category = Column(String, default="misc")   # education | background | goal | preference | misc
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Skill(Base):
    """Curated inventory = source of truth for the public dashboard."""
    __tablename__ = "skills"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)       # case-insensitive unique via functional index (migration)
    category = Column(String, nullable=True)    # maps to diagram bars; null = off-diagram
    achieved = Column(Boolean, default=True)    # 1/0; derived-from-notes = you have it
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Chat(Base):
    """Owner planning threads — NOT the visitor Query log."""
    __tablename__ = "chats"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=True)       # auto from first message, editable
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_id = Column(UUID(as_uuid=True), ForeignKey("chats.id", ondelete="CASCADE"), index=True)
    role = Column(String, nullable=False)       # user | assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())