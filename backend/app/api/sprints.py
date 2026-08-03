from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.connection import get_db
from app.models.user_model import User
from app.schemas.sprint_schema import SprintCreate, SprintResponse, SprintUpdate
from app.services import sprint_service

router = APIRouter(prefix="/api/projects/{project_id}/sprints", tags=["Sprints"])
router_root = APIRouter(prefix="/api/sprints", tags=["Sprints"])


@router.get("", response_model=List[SprintResponse])
def get_sprints(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return sprint_service.list_accessible_sprints(db, current_user.id, project_id)


@router_root.get("", response_model=List[SprintResponse])
def get_all_sprints(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return sprint_service.list_accessible_sprints(db, current_user.id)


@router.post("", response_model=SprintResponse, status_code=status.HTTP_201_CREATED)
def create_sprint(
    project_id: int,
    sprint_in: SprintCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return sprint_service.create_sprint(db, project_id, current_user.id, sprint_in)


@router_root.patch("/{sprint_id}", response_model=SprintResponse)
def update_sprint(
    sprint_id: int,
    sprint_in: SprintUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return sprint_service.update_sprint(db, sprint_id, current_user.id, sprint_in)
