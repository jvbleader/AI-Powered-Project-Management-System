import { Task, TaskComment, TaskFilters, UserProfile } from "@/types";
import { DEMO_TODAY } from "@/lib/mock/permissions";
import { tasks, taskComments } from "@/lib/mock/data";
import { enrichTask, filterAttachments, filterComments, filterTasks, respond } from "./core";

export const taskApi = {
  async list(filters?: TaskFilters, viewer?: UserProfile | null) {
    return respond(filterTasks(filters, viewer), 110);
  },

  async get(taskId: string, viewer?: UserProfile | null) {
    const task = filterTasks(undefined, viewer).find((entry) => entry.id === taskId) ?? tasks[0];
    return respond(task, 80);
  },

  async create(payload: Omit<Task, "id">) {
    const created: Task = { ...payload, id: `tsk-${tasks.length + 1}` };
    tasks.unshift(created);
    return respond(created, 170);
  },

  async update(taskId: string, payload: Partial<Task>) {
    const index = tasks.findIndex((task) => task.id === taskId);
    const updated = { ...tasks[index], ...payload };
    tasks[index] = updated;
    return respond(updated, 160);
  },

  async updateStatus(taskId: string, status: Task["status"]) {
    const index = tasks.findIndex((task) => task.id === taskId);
    const updated = {
      ...tasks[index],
      status,
      lastActivity: `${DEMO_TODAY}T12:00:00Z`,
    };
    tasks[index] = updated;
    return respond(updated, 120);
  },

  async updateAssignee(taskId: string, assigneeId: string) {
    const index = tasks.findIndex((task) => task.id === taskId);
    const updated = {
      ...tasks[index],
      assigneeId,
      lastActivity: `${DEMO_TODAY}T12:00:00Z`,
    };
    tasks[index] = updated;
    return respond(updated, 130);
  },

  async getEnrichedBoard(filters?: TaskFilters, viewer?: UserProfile | null) {
    return respond(filterTasks(filters, viewer).map(enrichTask), 110);
  },

  async listComments(taskId: string, viewer?: UserProfile | null) {
    return respond(filterComments(taskId, viewer), 90);
  },

  async addComment(payload: Omit<TaskComment, "id" | "createdAt" | "updatedAt">) {
    const created: TaskComment = {
      ...payload,
      id: `cmt-${taskComments.length + 1}`,
      createdAt: `${DEMO_TODAY}T12:00:00Z`,
      updatedAt: null,
    };
    taskComments.unshift(created);
    return respond(created, 120);
  },

  async updateComment(commentId: string, content: string) {
    const index = taskComments.findIndex((comment) => comment.id === commentId);
    const updated = {
      ...taskComments[index],
      content,
      updatedAt: `${DEMO_TODAY}T12:00:00Z`,
    };
    taskComments[index] = updated;
    return respond(updated, 120);
  },

  async getAttachments(taskId: string, viewer?: UserProfile | null) {
    return respond(filterAttachments(taskId, viewer), 90);
  },
};
