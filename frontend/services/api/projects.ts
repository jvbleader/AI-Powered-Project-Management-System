import { Project, ProjectFilters, UserProfile } from "@/types";
import { filterProjects, getProject, respond } from "./core";
import { projects } from "@/lib/mock/data";

export const projectApi = {
  async list(filters?: ProjectFilters, viewer?: UserProfile | null) {
    return respond(filterProjects(filters, viewer), 100);
  },

  async get(projectId: string, viewer?: UserProfile | null) {
    const accessibleProject = filterProjects(undefined, viewer).find((project) => project.id === projectId) ?? getProject(projectId);
    return respond(accessibleProject, 80);
  },

  async create(payload: Omit<Project, "id">) {
    const created: Project = {
      ...payload,
      id: `prj-${projects.length + 1}`,
    };
    projects.unshift(created);
    return respond(created, 180);
  },

  async update(projectId: string, payload: Partial<Project>) {
    const index = projects.findIndex((project) => project.id === projectId);
    const updated = { ...projects[index], ...payload };
    projects[index] = updated;
    return respond(updated, 160);
  },

  async addMember(projectId: string, memberId: string) {
    const index = projects.findIndex((project) => project.id === projectId);
    const current = projects[index];
    const nextMemberIds = current.memberIds.includes(memberId)
      ? current.memberIds
      : [...current.memberIds, memberId];
    const updated = { ...current, memberIds: nextMemberIds };
    projects[index] = updated;
    return respond(updated, 140);
  },

  async removeMember(projectId: string, memberId: string) {
    const index = projects.findIndex((project) => project.id === projectId);
    const current = projects[index];
    const updated = {
      ...current,
      memberIds: current.memberIds.filter((id) => id !== memberId),
    };
    projects[index] = updated;
    return respond(updated, 140);
  },
};
