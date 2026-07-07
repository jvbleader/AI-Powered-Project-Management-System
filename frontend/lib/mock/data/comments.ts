import { TaskComment } from "@/types";

export const taskComments: TaskComment[] = [
  {
    id: "cmt-001",
    taskId: "tsk-103",
    userId: "usr-manager",
    content: "Ưu tiên giữ cột Kanban gọn để sau này map tốt với mobile snapshot.",
    createdAt: "2026-06-28T08:30:00Z",
  },
  {
    id: "cmt-002",
    taskId: "tsk-103",
    userId: "usr-fe",
    content: "Đã tách phần card meta để dễ nối drag and drop ở bước tiếp theo.",
    createdAt: "2026-06-29T09:15:00Z",
  },
  {
    id: "cmt-003",
    taskId: "tsk-105",
    userId: "usr-be",
    content: "Cần chốt schema burn-up trước khi mình dựng dữ liệu sprint analytics.",
    createdAt: "2026-06-29T05:45:00Z",
  },
  {
    id: "cmt-004",
    taskId: "tsk-107",
    userId: "usr-leader",
    content: "Tạm thời dùng chunk size 800 token để benchmark pipeline.",
    createdAt: "2026-06-27T13:10:00Z",
  },
];
