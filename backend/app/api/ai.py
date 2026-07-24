from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.connection import get_db
from app.core.dependencies import get_current_user
from app.models.user_model import User
from app.schemas.ai_schema import QuickResponseRequest, QuickResponseResponse, ConfirmTasksRequest, ConfirmTasksResponse, ClassifyIntentResponse
from app.services.ai_services import quick_response
from app.services.ai_services.tools.write_tools import execute_create_tasks

router = APIRouter(prefix="/api/ai", tags=["AI"])


@router.post("/classify-intent", response_model=ClassifyIntentResponse)
def classify_intent(
    payload: QuickResponseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return quick_response.handle_classify_intent(db, current_user, payload)

@router.post("/execute", response_model=QuickResponseResponse)
def execute_ai(
    payload: QuickResponseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return quick_response.handle_execute_ai(db, current_user, payload)

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
        tasks_data=payload.tasks_data
    )
    return ConfirmTasksResponse(
        message=f"Tạo thành công {len(created_tasks)} tasks.",
        created_task_ids=[task.id for task in created_tasks]
    )
