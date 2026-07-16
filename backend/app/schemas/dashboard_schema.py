from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.project_schema import ProjectResponse


class DashboardTaskSummaryResponse(BaseModel):
    todo: int = 0
    inProgress: int = 0
    done: int = 0
    total: int = 0
    overdue: int = 0


class DashboardSprintSummaryResponse(BaseModel):
    id: int
    name: str
    status: Literal["PLANNED", "ACTIVE", "REVIEW", "CLOSED"]
    goal: Optional[str] = None
    startDate: date
    endDate: date
    plannedProgress: int = 0
    actualProgress: int = 0
    totalTasks: int = 0
    todoCount: int = 0
    inProgressCount: int = 0
    doneCount: int = 0
    estimatedHours: float = 0
    loggedHours: float = 0
    health: Literal["on-track", "watch", "critical"] = "on-track"


class DashboardTaskPreviewResponse(BaseModel):
    id: int
    key: str
    title: str
    status: Literal["todo", "in_progress", "done"]
    priority: str
    startDate: Optional[date] = None
    dueDate: Optional[date] = None
    assigneeName: Optional[str] = None
    sprintName: Optional[str] = None
    projectId: Optional[int] = None
    projectName: Optional[str] = None


class DashboardWorkloadMemberResponse(BaseModel):
    userId: int
    memberId: int
    name: str
    email: str
    roleName: str
    assignedTasks: int = 0
    todoTasks: int = 0
    inProgressTasks: int = 0
    doneTasks: int = 0
    overdueTasks: int = 0
    estimatedHours: float = 0
    loggedHours: float = 0
    progress: int = 0


class DashboardRecentLogworkResponse(BaseModel):
    id: int
    taskId: int
    taskKey: str
    taskTitle: str
    userId: int
    userName: str
    workDate: date
    hours: float
    note: str
    progressPercent: float = 0


class DashboardOverviewResponse(BaseModel):
    project: Optional[ProjectResponse] = None
    portfolioProgress: int = 0
    projectProgress: int = 0
    activeSprintProgress: int = 0
    estimatedHoursTotal: float = 0
    estimatedHoursDone: float = 0
    estimatedHoursRemaining: float = 0
    logworkCoverage: int = 0
    memberCount: int = 0
    membersLoggedToday: int = 0
    criticalAlerts: int = 0
    projectsInScope: int = 0
    openTasksInScope: int = 0
    taskSummary: DashboardTaskSummaryResponse = Field(default_factory=DashboardTaskSummaryResponse)
    activeSprint: Optional[DashboardSprintSummaryResponse] = None
    sprintSummaries: List[DashboardSprintSummaryResponse] = Field(default_factory=list)
    overdueTasks: List[DashboardTaskPreviewResponse] = Field(default_factory=list)
    activeTasks: List[DashboardTaskPreviewResponse] = Field(default_factory=list)
    workloadBoard: List[DashboardWorkloadMemberResponse] = Field(default_factory=list)
    recentLogwork: List[DashboardRecentLogworkResponse] = Field(default_factory=list)

class ProjectHealthPreviewResponse(BaseModel):
    id: int
    name: str
    code: str
    status: str
    progress: int = 0
    totalTasks: int = 0
    health: Literal["on-track", "watch", "critical"] = "on-track"


class GlobalDashboardOverviewResponse(BaseModel):
    totalProjects: int = 0
    activeProjects: int = 0
    completedProjects: int = 0
    taskSummary: DashboardTaskSummaryResponse = Field(default_factory=DashboardTaskSummaryResponse)
    globalWorkload: List[DashboardWorkloadMemberResponse] = Field(default_factory=list)
    upcomingDeadlines: List[DashboardTaskPreviewResponse] = Field(default_factory=list)
    overdueTasks: List[DashboardTaskPreviewResponse] = Field(default_factory=list)
    completedTasks: List[DashboardTaskPreviewResponse] = Field(default_factory=list)
    projectHealths: List[ProjectHealthPreviewResponse] = Field(default_factory=list)
    activeSprints: List[DashboardSprintSummaryResponse] = Field(default_factory=list)
    recentLogworks: List[DashboardRecentLogworkResponse] = Field(default_factory=list)
