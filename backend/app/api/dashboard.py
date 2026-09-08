from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.connection import get_db
from app.models.user_model import User
from app.schemas.dashboard_schema import DashboardOverviewResponse
from app.services import dashboard_service, project_service

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/overview", response_model=DashboardOverviewResponse)
def get_dashboard_overview(
    project_id: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    numeric_id = project_service.parse_project_id(project_id) if project_id else None
    return dashboard_service.get_dashboard_overview(db, current_user, numeric_id)


@router.get("/global-overview")
def get_global_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    return dashboard_service.get_global_overview(db, current_user)
