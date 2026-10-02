from sqlalchemy import Column, String, Integer, Text, DateTime, Enum, JSON, Boolean, ForeignKey, Table, LargeBinary
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
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

class Skill(Base):
    """Curated inventory = source of truth for the public dashboard."""
    __tablename__ = "skills"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    achieved = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

document_skills = Table(
    "document_skills",
    Base.metadata,
    Column("document_id", UUID(as_uuid=True),
           ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True),
    Column("skill_id", UUID(as_uuid=True),
           ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True),
)

class Document(Base):
    __tablename__ = "documents"
 
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    google_doc_id = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    chunk_count = Column(Integer, default=0)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
 
    # Containing folder; NULL = top level
    folder_id = Column(UUID(as_uuid=True),
                       ForeignKey("folders.id", ondelete="SET NULL"),
                       nullable=True, index=True)
 
    # Display metadata (tagging pipeline)
    summary = Column(Text, nullable=True)
    tag_status = Column(String, default="pending")     # pending | approved
    needs_review = Column(Boolean, default=False)      # set by delta sync on change
    parse_status = Column(String, default="text")      # text | multimodal | fallback
 
    # lazy="selectin" loads skills with the document in one extra query —
    skills = relationship("Skill", secondary=document_skills,
                          lazy="selectin", order_by="Skill.name")

class Folder(Base):
    """A node in the notes tree (adjacency list: parent_id, any depth). A folder
    can hold folders and notes. A course is a folder with is_course set, which
    also carries the course details below."""
    __tablename__ = "folders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("folders.id", ondelete="SET NULL"),
                       nullable=True, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Course details (used when is_course)
    is_course = Column(Boolean, nullable=False, default=False)
    summary = Column(Text, nullable=True)
    is_currently_learning = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)     # employer-facing note, e.g. "Teaching Assistant"
    grade = Column(String, nullable=True)   # free text: "A", "A-", "Pass"…

class ProfileNote(Base):
    """Living background: education, goal, preferences. One row per fact."""
    __tablename__ = "profile_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category = Column(String, default="misc")   # education | background | goal | preference | misc
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

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

class Resume(Base):
    """The owner's current resume: the original file (served for download) and
    its extracted text (given to the chatbot whole). At most one row — uploading
    a new version replaces it."""
    __tablename__ = "resumes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    data = Column(LargeBinary, nullable=False)
    text = Column(Text, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
