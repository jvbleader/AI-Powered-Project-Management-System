import { requestApi } from "./core";

export interface PendingLogWork {
  id: number;
  task_id: number;
  project_member_id: number;
  user_name: string;
  project_name?: string;
  task_title?: string;
  work_date: string;
  hours_spent: number;
  work_content: string;
  comment?: string;
  progress_percent: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
}

export const logworkApi = {
  getPending: async () => {
    const res = await requestApi<PendingLogWork[]>({
      method: "GET",
      path: "/api/v1/logworks/pending",
    });
    return res.data;
  },

  approve: async (logworkId: number) => {
    const res = await requestApi<PendingLogWork>({
      method: "PATCH",
      path: `/api/v1/logworks/${logworkId}/approve`,
    });
    return res.data;
  },

  reject: async (logworkId: number) => {
    const res = await requestApi<PendingLogWork>({
      method: "PATCH",
      path: `/api/v1/logworks/${logworkId}/reject`,
    });
    return res.data;
  },
};
