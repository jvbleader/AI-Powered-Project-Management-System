from typing import List

from sqlalchemy.orm import Session

from app.models.ai_model import AiConversation, AiMessage


def get_sessions_by_user(db: Session, user_id: int) -> List[AiConversation]:
    return (
        db.query(AiConversation)
        .filter(AiConversation.user_id == user_id)
        .order_by(AiConversation.created_at.desc())
        .all()
    )


def get_session_by_id_and_user(db: Session, session_id: int, user_id: int) -> AiConversation | None:
    return (
        db.query(AiConversation)
        .filter(AiConversation.id == session_id, AiConversation.user_id == user_id)
        .first()
    )


def create_session(db: Session, user_id: int, title: str) -> AiConversation:
    new_session = AiConversation(user_id=user_id, title=title)
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


def update_session(db: Session, session: AiConversation, title: str) -> AiConversation:
    session.title = title
    db.commit()
    db.refresh(session)
    return session


def delete_session(db: Session, session: AiConversation) -> None:
    db.delete(session)
    db.commit()


def get_messages_by_session(db: Session, session_id: int) -> List[AiMessage]:
    return (
        db.query(AiMessage)
        .filter(AiMessage.conversation_id == session_id)
        .order_by(AiMessage.created_at.asc())
        .all()
    )


def create_message(db: Session, session_id: int, sender: str, content: str) -> AiMessage:
    new_message = AiMessage(conversation_id=session_id, sender=sender, content=content)
    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    return new_message


def delete_messages_by_session(db: Session, session_id: int) -> None:
    db.query(AiMessage).filter(AiMessage.conversation_id == session_id).delete()
    db.commit()
