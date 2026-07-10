"use client";

import { useEffect, useState, useMemo } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { projectApi, userApi, workspaceApi } from "@/services/api";
import { isPrivilegedUser, normalizeViewer } from "@/lib/mock/permissions";
import { useAuthSession } from "@/hooks/use-session";
import type {
  Project,
  UserProfile,
  WorkspaceShellData,
} from "@/types";

import { ProjectList } from "./_components/project-list";
import { CreateProjectModal } from "./_components/create-project-modal";
import { EditProjectModal } from "./_components/edit-project-modal";

type ProjectsState = {
  shellData: WorkspaceShellData;
  projects: Project[];
};

let projectsPageCache: { viewerId: string; data: ProjectsState } | null = null;
let accessibleUsersCache: { viewerId: string; data: UserProfile[] } | null = null;

export default function ProjectsPage() {
  const session = useAuthSession();
  const viewer = useMemo(() => normalizeViewer(session?.currentUser), [session?.currentUser]);
  const canManage = isPrivilegedUser(viewer);
  const cachedProjectsState =
    projectsPageCache?.viewerId === viewer.id ? projectsPageCache.data : null;
  const cachedAccessibleUsers =
    accessibleUsersCache?.viewerId === viewer.id ? accessibleUsersCache.data : [];

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    cachedProjectsState?.projects[0]?.id ?? null,
  );
  const [projectsState, setProjectsState] = useState<ProjectsState | null>(cachedProjectsState);
  const [accessibleUsers, setAccessibleUsers] = useState<UserProfile[]>(cachedAccessibleUsers);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadProjects() {
      const [{ data: shellData }, { data: projects }] = await Promise.all([
        workspaceApi.getShellData(viewer),
        projectApi.list(undefined, viewer),
      ]);

      if (isCancelled) {
        return;
      }

      const nextState = { shellData, projects };
      projectsPageCache = { viewerId: viewer.id, data: nextState };
      setProjectsState(nextState);
      setSelectedProjectId((current) => current ?? projects[0]?.id ?? null);
    }

    void loadProjects();

    return () => {
      isCancelled = true;
    };
  }, [viewer]);

  const shellData =
    projectsState?.shellData ??
    ({
      currentUser: viewer,
      activeProjects: 0,
      openTasks: 0,
      missingLogwork: 0,
      alertCount: 0,
    } satisfies WorkspaceShellData);

  const projectList = projectsState?.projects ?? [];
  const selectedProject =
    projectList.find((project) => project.id === selectedProjectId) ?? projectList[0] ?? null;

  async function refreshProjects(nextSelectedId?: string | null) {
    const [{ data: shellData }, { data: projects }] = await Promise.all([
      workspaceApi.getShellData(viewer),
      projectApi.list(undefined, viewer),
    ]);

    const nextState = { shellData, projects };
    projectsPageCache = { viewerId: viewer.id, data: nextState };
    setProjectsState(nextState);
    setSelectedProjectId(nextSelectedId ?? selectedProjectId ?? projects[0]?.id ?? null);
  }

  async function ensureAccessibleUsers() {
    if (accessibleUsersCache?.viewerId === viewer.id && accessibleUsersCache.data.length) {
      setAccessibleUsers(accessibleUsersCache.data);
      return accessibleUsersCache.data;
    }

    const { data: users } = await userApi.list(viewer);
    accessibleUsersCache = { viewerId: viewer.id, data: users };
    setAccessibleUsers(users);
    return users;
  }

  async function handleOpenCreateProject() {
    await ensureAccessibleUsers();
    setIsCreateModalOpen(true);
  }

  async function handleOpenEditProject(project: Project) {
    await ensureAccessibleUsers();
    setEditingProject(project);
  }

  return (
    <WorkspaceShell
      shellData={shellData}
      heading={canManage ? "Quản lí dự án" : "Dự án của tôi"}
      subheading={
        canManage
          ? "Theo dõi toàn bộ danh mục dự án, tạo dự án mới và xem chi tiết nguồn lực theo từng dự án."
          : "Chỉ hiển thị các dự án bạn tham gia và những công việc được giao cho bạn."
      }
      highlightLabel="Phạm vi xem"
      highlightValue={canManage ? "Admin / Manager / Leader" : "Thành viên"}
    >
      <section className="two-up" style={{ gridTemplateColumns: "1fr" }}>
        <ProjectList
          projects={projectList}
          selectedProjectId={selectedProject?.id ?? null}
          onSelectProject={setSelectedProjectId}
          canManage={canManage}
          viewerId={viewer.id}
          viewerRole={viewer.role}
          onAddProjectClick={viewer.role === "ADMIN" ? handleOpenCreateProject : undefined}
          onEditProjectClick={handleOpenEditProject}
        />
      </section>

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        viewerId={viewer.id}
        accessibleUsers={accessibleUsers}
        onProjectCreated={refreshProjects}
      />

      <EditProjectModal
        isOpen={!!editingProject}
        onClose={() => setEditingProject(null)}
        project={editingProject}
        viewerId={viewer.id}
        viewerRole={viewer.role}
        accessibleUsers={accessibleUsers}
        onProjectUpdated={() => refreshProjects(selectedProjectId)}
      />
    </WorkspaceShell>
  );
}
