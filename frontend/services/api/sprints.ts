import { Sprint, SprintFilters, UserProfile } from "@/types";
import { filterSprints, getSprint, respond } from "./core";
import { sprints } from "@/lib/mock/data";

export const sprintApi = {
  async list(filters?: SprintFilters, viewer?: UserProfile | null) {
    return respond(filterSprints(filters, viewer), 90);
  },

  async get(sprintId: string, viewer?: UserProfile | null) {
    const accessibleSprint =
      filterSprints(undefined, viewer).find((sprint) => sprint.id === sprintId) ??
      getSprint(sprintId);
    return respond(accessibleSprint, 80);
  },

  async create(payload: Omit<Sprint, "id">) {
    const created: Sprint = { ...payload, id: `spr-${sprints.length + 1}` };
    sprints.unshift(created);
    return respond(created, 160);
  },

  async update(sprintId: string, payload: Partial<Sprint>) {
    const index = sprints.findIndex((sprint) => sprint.id === sprintId);
    const updated = { ...sprints[index], ...payload };
    sprints[index] = updated;
    return respond(updated, 150);
  },
};
