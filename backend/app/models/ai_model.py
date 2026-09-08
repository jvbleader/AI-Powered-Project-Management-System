from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.core.connection import Base


class AiConversation(Base):
    __tablename__ = "ai_conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    title = Column(String(255))
    context_summary = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AiMessage(Base):
    __tablename__ = "ai_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id"), nullable=False, index=True)
    sender = Column(String(50), nullable=False)  # user, assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class AiDraft(Base):
    """A reviewable draft block belonging to an AI message.

    Draft state deliberately lives outside Markdown so an LLM response can never
    accidentally confirm or reject a draft by emitting a fence suffix.
    """

    __tablename__ = "ai_drafts"
    __table_args__ = (UniqueConstraint("message_id", "block_index", name="uq_ai_drafts_message_block"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(Integer, ForeignKey("ai_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    fence = Column(String(64), nullable=False)
    block_index = Column(Integer, nullable=False)
    payload = Column(Text, nullable=False)
    status = Column(String(16), nullable=False, default="pending", index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    resolved_at = Column(DateTime, nullable=True)
