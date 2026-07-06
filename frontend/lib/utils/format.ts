import type {
  HealthTone,
  ProjectStatus,
  SprintStatus,
  TaskPriority,
  TaskStatus,
  UserRole,
  UserStatus,
} from "@/types/dto";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  month: "short",
  day: "numeric",
});

export function formatDate(date: string) {
  return dateFormatter.format(new Date(date));
}

export function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatRange(start: string, end: string) {
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

export function projectStatusLabel(status: ProjectStatus) {
  return {
    PLANNING: "Đang lập kế hoạch",
    ACTIVE: "Đang triển khai",
    AT_RISK: "Cần lưu ý",
    COMPLETED: "Hoàn thành",
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

export function taskStatusLabel(status: TaskStatus) {
  return {
    TODO: "Cần thực hiện",
    IN_PROGRESS: "Đang xử lý",
    REVIEW: "Chờ rà soát",
    BLOCKED: "Đang vướng",
    DONE: "Hoàn thành",
  }[status];
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
    SUSPENDED: "Tạm dừng",
    LOCKED: "Đã khóa",
  }[status];
}

export function daysUntil(date: string) {
  const target = new Date(date).getTime();
  const today = new Date("2026-06-29T12:00:00Z").getTime();
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}
