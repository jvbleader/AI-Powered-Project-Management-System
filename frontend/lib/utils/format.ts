import type {
  HealthTone,
  ProjectStatus,
  SprintStatus,
  TaskPriority,
  TaskStatus,
  UserRole,
  UserStatus,
} from "@/types";

export const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";
export const HEAD_OF_DEV_DEPARTMENT = "Head of Dev";
export const ROLE_PM = "Project Manager / Product Owner / Group Member";
export const ROLE_LEADER = "Leader";
export const ROLE_DIRECTOR = "Giám đốc";
export const ROLE_ADMIN = "Admin";

function normalizeApiDateString(date: string) {
  const trimmed = date.trim();

  if (!trimmed) {
    return trimmed;
  }

  // Legacy backend payloads may return UTC timestamps without an explicit offset.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)) {
    return `${trimmed}Z`;
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)) {
    return `${trimmed.replace(" ", "T")}Z`;
  }

  return trimmed;
}

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  month: "short",
  day: "numeric",
  timeZone: VIETNAM_TIMEZONE,
});

export function formatDate(date: string) {
  if (!date) return "(Chưa có)";
  const d = new Date(normalizeApiDateString(date));
  if (isNaN(d.getTime())) return "(Không hợp lệ)";
  return dateFormatter.format(d);
}

export function formatDateTime(date: string) {
  if (!date) return "(Chưa có)";
  const d = new Date(normalizeApiDateString(date));
  if (isNaN(d.getTime())) return "(Không hợp lệ)";
  return new Intl.DateTimeFormat("vi-VN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: VIETNAM_TIMEZONE,
  }).format(d);
}

export function toVietnamDateInputValue(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
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
  const normalized = (role || "").trim();

  const labels: Record<string, string> = {
    ADMIN: "Admin",
    MANAGER: "Quản lý dự án",
    LEADER: "Trưởng nhóm",
    MEMBER: "Thành viên",
    "Lập trình viên": "Lập trình viên",
    Tester: "Tester",
    QA: "QA",
    QC: "QC",
    [ROLE_PM]: "Manager / PO / Group Manager",
    [ROLE_LEADER]: "Team Leader",
    [ROLE_DIRECTOR]: "Giám đốc",
    [ROLE_ADMIN]: "Admin",
  };

  return labels[normalized] ?? normalized;
}

export function isAdminRole(role: UserRole) {
  return (role || "").trim() === ROLE_ADMIN || (role || "").trim() === "ADMIN";
}

export function isDirectorRole(role: UserRole) {
  return (role || "").trim() === ROLE_DIRECTOR;
}

export function isManagerRole(role: UserRole) {
  const normalized = (role || "").trim();
  return normalized === ROLE_PM || normalized === "MANAGER";
}

export function isLeaderRole(role: UserRole) {
  const normalized = (role || "").trim();
  return normalized === ROLE_LEADER || normalized === "LEADER";
}

export function getRoleTone(role: UserRole) {
  const roleStr = (role || "").trim();
  if (roleStr.includes("Manager") || roleStr.includes("PM") || roleStr.includes("Owner") || isManagerRole(roleStr)) {
    return "critical" as const;
  }
  if (roleStr.includes("Leader") || isLeaderRole(roleStr)) {
    return "accent" as const;
  }
  return "neutral" as const;
}

export function isHeadOfDevDepartment(department?: string | null) {
  return (department || "").trim() === HEAD_OF_DEV_DEPARTMENT;
}

export function hasCompanywideProjectAccess(
  role: UserRole,
  department?: string | null,
) {
  return isDirectorRole(role) || isHeadOfDevDepartment(department);
}

export function canManageUsers(role: UserRole) {
  return isAdminRole(role);
}

export function canAccessTeamDirectoryRole(
  role: UserRole,
  department?: string | null,
) {
  return (
    canManageUsers(role) ||
    hasCompanywideProjectAccess(role, department) ||
    isManagerRole(role) ||
    isLeaderRole(role)
  );
}

export function canCreateProjects(
  role: UserRole,
  department?: string | null,
) {
  return (
    !isAdminRole(role) &&
    (hasCompanywideProjectAccess(role, department) ||
      isManagerRole(role) ||
      isLeaderRole(role))
  );
}

export function canManageProjectsByRole(
  role: UserRole,
  department?: string | null,
) {
  return hasCompanywideProjectAccess(role, department) || isManagerRole(role) || isLeaderRole(role);
}

export function normalizeProjectRoleName(roleName: string) {
  const normalized = roleName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (["PROJECT_MANAGER", "PROJECT_MANAGER_ROLE", "PROJECT_MANAGERS", "MANAGER", "PM"].includes(normalized)) {
    return "PROJECT_MANAGER";
  }

  if (["PROJECT_MEMBER", "MEMBER"].includes(normalized)) {
    return "PROJECT_MEMBER";
  }

  if (["DEVELOPER", "DEV"].includes(normalized)) {
    return "DEVELOPER";
  }

  if (["QA", "TESTER"].includes(normalized)) {
    return "QA";
  }

  if (["VIEWER", "READ_ONLY", "READONLY"].includes(normalized)) {
    return "VIEWER";
  }

  return normalized || roleName;
}

export function isSupportedProjectRoleName(roleName: string) {
  return ["PROJECT_MANAGER", "PROJECT_MEMBER", "DEVELOPER", "QA", "VIEWER"].includes(
    normalizeProjectRoleName(roleName),
  );
}

export function projectRoleLabel(roleName: string) {
  return roleName;
}

export function projectStatusLabel(status: ProjectStatus) {
  return {
    PLANNING: "Đang lập kế hoạch",
    ACTIVE: "Đang triển khai",
    AT_RISK: "Rủi ro trễ hạn",
    COMPLETED: "Đã hoàn thành",
    ON_HOLD: "Tạm dừng",
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

export function getTaskBgColor(status: TaskStatus) {
  switch (toWorkflowTaskStatus(status)) {
    case "TODO":
      return "#fef08a";
    case "IN_PROGRESS":
      return "#bfdbfe";
    case "DONE":
      return "#bbf7d0";
    default:
      return "var(--surface)";
  }
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
