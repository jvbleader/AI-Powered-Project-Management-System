from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.connection import get_db
from app.core.dependencies import get_current_user
from app.models.user_model import User
from app.schemas.project_schema import (
    PaginatedProjectsResponse,
    ProjectCreate,
    ProjectDetailResponse,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectMemberUpdate,
    ProjectResponse,
    ProjectUpdate,
    RoleResponse,
)
from app.services import project_service
from app.utils.project_helpers import build_member_response, build_project_response

router = APIRouter()


@router.get("/api/project-roles", response_model=list[RoleResponse])
def list_project_roles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return project_service.list_project_roles(db)


@router.get("/api/projects", response_model=PaginatedProjectsResponse)
def list_projects(
    search: str | None = Query(None),
    status: str | None = Query(None),
    manager_id: int | None = Query(None),
    start_date_from: date | None = Query(None),
    start_date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    projects, total, total_pages = project_service.list_projects(
        db=db,
        current_user=current_user,
        search=search,
        status=status,
        manager_id=manager_id,
        start_date_from=start_date_from,
        start_date_to=start_date_to,
        page=page,
        page_size=page_size,
    )
    items = [build_project_response(db, project) for project in projects]
    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
    }


@router.post("/api/projects", response_model=ProjectDetailResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = project_service.create_project(db, current_user, data)
    return build_project_response(db, project, include_members=True)


@router.get("/api/projects/{project_id}", response_model=ProjectDetailResponse)
def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = project_service.get_project(db, current_user, project_id)
    return build_project_response(db, project, include_members=True)


@router.patch("/api/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = project_service.update_project(db, current_user, project_id, data)
    return build_project_response(db, project)


@router.get("/api/projects/{project_id}/members", response_model=list[ProjectMemberResponse])
def list_project_members(
    project_id: str,
    search: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = project_service.list_project_members(db, current_user, project_id, search)
    return [build_member_response(member, user, role) for member, user, role in rows]


@router.post(
    "/api/projects/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_project_member(
    project_id: str,
    data: ProjectMemberCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member, user, role = project_service.add_project_member(db, current_user, project_id, data)
    return build_member_response(member, user, role)


@router.patch(
    "/api/projects/{project_id}/members/{member_id}",
    response_model=ProjectMemberResponse,
)
def update_project_member(
    project_id: str,
    member_id: int,
    data: ProjectMemberUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member, user, role = project_service.update_project_member(db, current_user, project_id, member_id, data)
    return build_member_response(member, user, role)


@router.delete("/api/projects/{project_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project_member(
    project_id: str,
    member_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project_service.remove_project_member(db, current_user, project_id, member_id)
