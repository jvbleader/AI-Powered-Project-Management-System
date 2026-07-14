from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.connection import get_db
from app.core.dependencies import get_current_user
from app.models.user_model import User
from app.schemas.ai_schema import QuickResponseRequest, QuickResponseResponse
from app.services import ai_quick_response_service

router = APIRouter(prefix="/api/ai", tags=["AI"])


@router.post("/quick-response", response_model=QuickResponseResponse)
def quick_response(
    payload: QuickResponseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ai_quick_response_service.handle_quick_response(db, current_user, payload)
