from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List

from app.core.connection import get_db
from app.core.dependencies import get_current_user
from app.core.redis_client import redis_client
from app.models.user_model import User
from app.repositories import ai_repository
from app.schemas.ai_schema import (
    AiMessageResponse,
    AiSessionResponse,
    ClassifyIntentResponse,
    ConfirmSprintStatusRequest,
    ConfirmSprintStatusResponse,
    ConfirmTasksRequest,
    ConfirmTasksResponse,
    CreateAiSessionRequest,
    QuickResponseRequest,
)
from app.services.ai_services import service as ai_service
from app.services.ai_services.tools.action_tools import (
    execute_create_tasks,
    execute_update_sprint_statuses,
)

router = APIRouter(prefix="/api/ai", tags=["AI"])


class ChatMessageRequest(BaseModel):
    session_id: str
    message: str
    project_id: int | None = None


class UpdateAiSessionRequest(BaseModel):
    title: str


class UpdateAiMessageRequest(BaseModel):
    content: str


@router.post("/chat")
async def chat_stream(
    payload: ChatMessageRequest,
    current_user: User = Depends(get_current_user),
):
    # Không inject Depends(get_db) vào stream: FastAPI đóng session khi SSE bắt đầu.
    return StreamingResponse(
        ai_service.stream_chat_sse(
            session_id=payload.session_id,
            message=payload.message,
            current_user_id=current_user.id,
            project_id=payload.project_id,
        ),
        media_type="text/event-stream",
    )


@router.get("/sessions", response_model=List[AiSessionResponse])
def get_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ai_service.get_user_sessions(db, current_user)


@router.post("/sessions", response_model=AiSessionResponse)
def create_session(
    payload: CreateAiSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ai_service.create_user_session(db, current_user, payload.title)


@router.get("/sessions/{session_id}/messages", response_model=List[AiMessageResponse])
def get_session_messages(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = ai_repository.get_session_by_id_and_user(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return ai_service.get_user_session_messages(db, current_user, session_id)


@router.put("/sessions/{session_id}", response_model=AiSessionResponse)
def update_session(
    session_id: int,
    payload: UpdateAiSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = ai_service.update_user_session(db, current_user, session_id, payload.title)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.put("/messages/{message_id}")
def update_message(
    message_id: int,
    payload: UpdateAiMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = ai_service.update_message_content(db, current_user, message_id, payload.content)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found or not owned by user")
    return {"status": "ok", "message": "Message updated successfully"}


@router.delete("/sessions/{session_id}")
async def clear_chat_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if session_id.isdigit():
        ai_service.delete_user_session(db, current_user, int(session_id))

    pattern = f"checkpoint*{session_id}*"
    keys = redis_client.keys(pattern)
    if keys:
        redis_client.delete(*keys)
    return {"status": "ok", "message": "Session cleared"}


@router.post("/classify-intent", response_model=ClassifyIntentResponse)
def classify_intent(
    payload: QuickResponseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ai_service.handle_classify_intent(db, current_user, payload)


@router.post("/confirm-tasks", response_model=ConfirmTasksResponse)
def confirm_tasks(
    payload: ConfirmTasksRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        created_tasks = execute_create_tasks(
            db=db,
            current_user=current_user,
            project_id=payload.project_id,
            tasks_data=payload.tasks_data,
        )
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    if payload.message_id:
        ai_repository.confirm_draft_message(
            db, current_user.id, payload.message_id, fence="json_task_draft"
        )
    else:
        ai_repository.confirm_latest_draft_message(db, current_user.id)

    return ConfirmTasksResponse(
        message=f"Tạo thành công {len(created_tasks)} tasks.",
        created_task_ids=[task.id for task in created_tasks],
    )


@router.post("/confirm-sprint-status", response_model=ConfirmSprintStatusResponse)
def confirm_sprint_status(
    payload: ConfirmSprintStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        updated = execute_update_sprint_statuses(db, current_user, payload.updates)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    if payload.message_id:
        ai_repository.confirm_draft_message(
            db, current_user.id, payload.message_id, fence="json_sprint_status_draft"
        )

    return ConfirmSprintStatusResponse(
        message=f"Cập nhật thành công {len(updated)} sprint.",
        updated=updated,
    )
