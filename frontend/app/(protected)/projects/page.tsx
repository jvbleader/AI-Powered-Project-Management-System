"use client";

import { useEffect, useState } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { logworkApi, projectApi, taskApi, userApi, workspaceApi } from "@/services/api";
import { canManageProject, isPrivilegedUser, normalizeViewer } from "@/lib/mock/permissions";
import { useAuthSession } from "@/hooks/use-session";
import type {
  LogworkEntry,
  Project,
  Task,
  EnrichedTask,
  UserProfile,
  WorkspaceShellData,
} from "@/types";

import { ProjectList } from "./_components/project-list";
import { CreateProjectModal } from "./_components/create-project-modal";

type ProjectsState = {
  shellData: WorkspaceShellData;
  projects: Project[];
  users: UserProfile[];
};

export default function ProjectsPage() {
  const session = useAuthSession();
  const viewer = normalizeViewer(session?.currentUser);
  const canManage = isPrivilegedUser(viewer);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectsState, setProjectsState] = useState<ProjectsState | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadProjects() {
      const [{ data: shellData }, { data: projects }, { data: users }] = await Promise.all([
        workspaceApi.getShellData(viewer),
        projectApi.list(undefined, viewer),
        userApi.list(viewer),
      ]);

      if (isCancelled) {
        return;
      }

      setProjectsState({ shellData, projects, users });
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
  const accessibleUsers = projectsState?.users ?? [];

  async function refreshProjects(nextSelectedId?: string | null) {
    const [{ data: shellData }, { data: projects }, { data: users }] = await Promise.all([
      workspaceApi.getShellData(viewer),
      projectApi.list(undefined, viewer),
      userApi.list(viewer),
    ]);

    setProjectsState({ shellData, projects, users });
    setSelectedProjectId(nextSelectedId ?? selectedProjectId ?? projects[0]?.id ?? null);
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
          onAddProjectClick={() => setIsCreateModalOpen(true)}
        />
      </section>

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        viewerId={viewer.id}
        accessibleUsers={accessibleUsers}
        onProjectCreated={refreshProjects}
      />
    </WorkspaceShell>
  );
}
