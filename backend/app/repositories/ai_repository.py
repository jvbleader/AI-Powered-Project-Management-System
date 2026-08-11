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


def delete_session(db: Session, session_id: int) -> None:
    db.query(AiConversation).filter(AiConversation.id == session_id).delete(synchronize_session=False)
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


def get_message_by_id(db: Session, message_id: int) -> AiMessage | None:
    return db.query(AiMessage).filter(AiMessage.id == message_id).first()


def update_message_content(db: Session, message: AiMessage, new_content: str) -> AiMessage:
    message.content = new_content
    db.commit()
    db.refresh(message)
    return message


def confirm_draft_message(
    db: Session, user_id: int, message_id: int, fence: str = "json_task_draft"
) -> bool:
    message = get_message_by_id(db, message_id)
    if not message:
        return False
    session = get_session_by_id_and_user(db, message.conversation_id, user_id)
    if not session:
        return False
    marker = f"```{fence}\n"
    confirmed = f"```{fence}_confirmed\n"
    if marker in message.content:
        message.content = message.content.replace(marker, confirmed)
        db.commit()
        return True
    return False


def confirm_latest_draft_message(db: Session, user_id: int):
    latest_message = (
        db.query(AiMessage)
        .join(AiConversation, AiMessage.conversation_id == AiConversation.id)
        .filter(AiConversation.user_id == user_id)
        .filter(AiMessage.sender == "assistant")
        .filter(AiMessage.content.like("%```json_task_draft\n%"))
        .order_by(AiMessage.created_at.desc())
        .first()
    )
    if latest_message:
        latest_message.content = latest_message.content.replace(
            "```json_task_draft\n", "```json_task_draft_confirmed\n"
        )
        db.commit()
        return True
    return False


def delete_messages_by_session(db: Session, session_id: int) -> None:
    db.query(AiMessage).filter(AiMessage.conversation_id == session_id).delete()
    db.commit()
