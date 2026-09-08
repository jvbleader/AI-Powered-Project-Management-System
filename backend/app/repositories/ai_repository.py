from typing import List

from sqlalchemy.orm import Session

from app.models.ai_model import AiConversation, AiDraft, AiMessage


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


def get_drafts_by_message_ids(db: Session, message_ids: list[int]) -> dict[int, list[AiDraft]]:
    if not message_ids:
        return {}
    drafts = (
        db.query(AiDraft)
        .filter(AiDraft.message_id.in_(message_ids))
        .order_by(AiDraft.message_id, AiDraft.block_index)
        .all()
    )
    grouped: dict[int, list[AiDraft]] = {}
    for draft in drafts:
        grouped.setdefault(draft.message_id, []).append(draft)
    return grouped


def get_draft_by_id(db: Session, draft_id: int) -> AiDraft | None:
    # Confirmation/rejection must serialize concurrent requests for the same
    # draft so a double-click cannot create tasks twice.
    return db.query(AiDraft).filter(AiDraft.id == draft_id).with_for_update().first()


def update_message_content(db: Session, message: AiMessage, new_content: str) -> AiMessage:
    message.content = new_content
    db.commit()
    db.refresh(message)
    return message


def confirm_draft_message(
    db: Session, user_id: int, message_id: int, fence: str = "json_task_draft"
) -> bool:
    from app.services.ai_services.draft_confirm import get_owned_message, set_draft_message_status

    try:
        message = get_owned_message(db, user_id, message_id)
    except ValueError:
        return False
    return set_draft_message_status(db, message, fence, "confirmed")


def confirm_latest_draft_message(db: Session, user_id: int):
    latest_message = (
        db.query(AiMessage)
        .join(AiConversation, AiMessage.conversation_id == AiConversation.id)
        .filter(AiConversation.user_id == user_id)
        .filter(AiMessage.sender == "assistant")
        .filter(AiMessage.content.like("%```json_task_draft%"))
        .filter(~AiMessage.content.like("%```json_task_draft_confirmed%"))
        .filter(~AiMessage.content.like("%```json_task_draft_rejected%"))
        .order_by(AiMessage.created_at.desc())
        .first()
    )
    if not latest_message:
        return False
    from app.services.ai_services.draft_confirm import set_draft_message_status

    return set_draft_message_status(db, latest_message, "json_task_draft", "confirmed")


def delete_messages_by_session(db: Session, session_id: int) -> None:
    db.query(AiMessage).filter(AiMessage.conversation_id == session_id).delete()
    db.commit()
