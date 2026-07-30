from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.connection import get_db
from app.core.dependencies import get_current_user
from app.models.user_model import User
from app.schemas.ai_schema import (
    ClassifyIntentResponse,
    ConfirmTasksRequest,
    ConfirmTasksResponse,
    QuickResponseRequest,
    QuickResponseResponse,
)
from app.services.ai_services import service as ai_service
from app.services.ai_services.tools.write_tools import execute_create_tasks

router = APIRouter(prefix="/api/ai", tags=["AI"])


from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.redis_client import redis_client


class ChatMessageRequest(BaseModel):
    session_id: str
    message: str
    project_id: int | None = None


@router.post("/chat")
async def chat_stream(
    payload: ChatMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return StreamingResponse(
        ai_service.stream_chat_sse(
            session_id=payload.session_id,
            message=payload.message,
            db=db,
            current_user=current_user,
            project_id=payload.project_id,
        ),
        media_type="text/event-stream",
    )


from typing import List

from app.schemas.ai_schema import AiMessageResponse, AiSessionResponse, CreateAiSessionRequest


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
    return ai_service.get_user_session_messages(db, current_user, session_id)


class UpdateAiSessionRequest(BaseModel):
    title: str


@router.put("/sessions/{session_id}", response_model=AiSessionResponse)
def update_session(
    session_id: int,
    payload: UpdateAiSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = ai_service.update_user_session(db, current_user, session_id, payload.title)
    if not session:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/sessions/{session_id}")
async def clear_chat_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if session_id.isdigit():
        ai_service.delete_user_session(db, current_user, int(session_id))

    # Xoá trong Redis Checkpointer
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


@router.post("/execute", response_model=QuickResponseResponse)
def execute_ai(
    payload: QuickResponseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ai_service.handle_execute_ai(db, current_user, payload)


@router.post("/confirm-tasks", response_model=ConfirmTasksResponse)
def confirm_tasks(
    payload: ConfirmTasksRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    created_tasks = execute_create_tasks(
        db=db,
        current_user=current_user,
        project_id=payload.project_id,
        tasks_data=payload.tasks_data,
    )
    return ConfirmTasksResponse(
        message=f"Tạo thành công {len(created_tasks)} tasks.",
        created_task_ids=[task.id for task in created_tasks],
    )
