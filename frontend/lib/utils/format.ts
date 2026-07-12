import type {
  HealthTone,
  ProjectStatus,
  SprintStatus,
  TaskPriority,
  TaskStatus,
  UserRole,
  UserStatus,
} from "@/types";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  month: "short",
  day: "numeric",
});

export function formatDate(date: string) {
  if (!date) return "(Chưa có)";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "(Không hợp lệ)";
  return dateFormatter.format(d);
}

export function formatDateTime(date: string) {
  if (!date) return "(Chưa có)";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "(Không hợp lệ)";
  return new Intl.DateTimeFormat("vi-VN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatRange(start: string, end: string) {
  if (!start && !end) return "Chưa xác định";
  if (!end) return `${formatDate(start)} - (Chưa có)`;
  if (!start) return `(Chưa có) - ${formatDate(end)}`;
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function formatHours(hours: number) {
  return `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h`;
}

export function formatPercent(value: number) {
  return `${value}%`;
}

export function roleLabel(role: UserRole) {
  return {
    ADMIN: "Quản trị viên",
    MANAGER: "Quản lý dự án",
    LEADER: "Trưởng nhóm",
    MEMBER: "Thành viên",
  }[role];
}

export function projectRoleLabel(roleName: string) {
  const map: Record<string, string> = {
    PROJECT_MANAGER: "Project Manager",
    DEVELOPER: "Developer",
    QA: "QA",
    VIEWER: "Viewer",
  };
  return map[roleName] || roleName;
}

export function projectStatusLabel(status: ProjectStatus) {
  return {
    PLANNING: "Đang lập kế hoạch",
    ACTIVE: "Đang triển khai",
    AT_RISK: "Rủi ro trễ hạn",
    COMPLETED: "Đã hoàn thành",
  }[status];
}

export function sprintStatusLabel(status: SprintStatus) {
  return {
    PLANNED: "Kế hoạch",
    ACTIVE: "Đang chạy",
    REVIEW: "Đánh giá",
    CLOSED: "Đã đóng",
  }[status];
}

export function toWorkflowTaskStatus(status: TaskStatus): "TODO" | "IN_PROGRESS" | "DONE" {
  if (status === "DONE") {
    return "DONE";
  }

  if (status === "TODO") {
    return "TODO";
  }

  return "IN_PROGRESS";
}

export function taskStatusLabel(status: TaskStatus) {
  return {
    TODO: "Cần thực hiện",
    IN_PROGRESS: "Đang tiến hành",
    DONE: "Hoàn thành",
  }[toWorkflowTaskStatus(status)];
}

export function taskStatusTone(status: TaskStatus): "todo" | "progress" | "done" {
  return {
    TODO: "todo" as const,
    IN_PROGRESS: "progress" as const,
    DONE: "done" as const,
  }[toWorkflowTaskStatus(status)];
}

export function taskPriorityLabel(priority: TaskPriority) {
  return {
    LOW: "Thấp",
    MEDIUM: "Trung bình",
    HIGH: "Cao",
    CRITICAL: "Khẩn cấp",
  }[priority];
}

export function healthToneLabel(tone: HealthTone) {
  return {
    "on-track": "Ổn định",
    watch: "Cần theo dõi",
    critical: "Rủi ro cao",
  }[tone];
}

export function presenceLabel(status: "online" | "focus" | "offline") {
  return {
    online: "Đang hoạt động",
    focus: "Đang tập trung",
    offline: "Ngoại tuyến",
  }[status];
}

export function userStatusLabel(status: UserStatus) {
  return {
    ACTIVE: "Đang hoạt động",
    INACTIVE: "Không hoạt động",
  }[status];
}

export function daysUntil(date: string) {
  const target = new Date(date).getTime();
  const today = new Date("2026-06-29T12:00:00Z").getTime();
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

export function differenceInDays(start: string | Date, end: string | Date) {
  const startDate = new Date(start).getTime();
  const endDate = new Date(end).getTime();
  return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
}

export function generateDateRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const dates: Date[] = [];

  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}
