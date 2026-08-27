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

export function formatAssigneeNames(
  task?: {
    assignees?: Array<{ name?: string | null } | null> | null;
    assignee?: { name?: string | null } | null;
    assigneeName?: string | null;
  } | null,
  emptyLabel = "Chưa giao",
) {
  const names = (task?.assignees ?? [])
    .map((assignee) => (assignee?.name || "").trim())
    .filter(Boolean);
  if (names.length) {
    return names.join(", ");
  }
  const fallback = (task?.assignee?.name || task?.assigneeName || "").trim();
  return fallback || emptyLabel;
}

export function roleLabel(role: UserRole) {
  const normalized = (role || "").trim();

  const labels: Record<string, string> = {
    ADMIN: "Admin",
    MANAGER: "Quản lý dự án",
    LEADER: "Trưởng nhóm",
    MEMBER: "Thành viên",
    "Lập trình viên": "Lập trình viên",
    "Chuyên viên": "Chuyên viên",
    Tester: "Tester",
    QA: "QA",
    QC: "QC",
    [ROLE_PM]: "Manager / Group Manager",
    [ROLE_LEADER]: "Team Leader",
    "Trợ lý giám đốc": "Trợ lý giám đốc",
    "Kỹ sư cầu nối": "BrSE",
    Comtor: "Comtor",
    [ROLE_DIRECTOR]: "Giám đốc",
    HR: "HR",
    [ROLE_ADMIN]: "Admin",
  };

  return labels[normalized] ?? normalized;
}

/** Tách role ghép (vd. "Project Manager / Product Owner / Group Member") thành từng nhãn xếp cột. */
export function expandRoleDisplayLabels(
  roleOrRoles: UserRole | UserRole[] | null | undefined,
): string[] {
  const roles = (Array.isArray(roleOrRoles)
    ? roleOrRoles
    : roleOrRoles
      ? [roleOrRoles]
      : []
  )
    .map((role) => (role || "").trim())
    .filter(Boolean);

  const parts: string[] = [];

  const pushUnique = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !parts.includes(trimmed)) {
      parts.push(trimmed);
    }
  };

  for (const role of roles) {
    // Tách chuỗi gốc trước để giữ đủ các nhánh role người dùng đang thấy trên UI
    const rawParts = role.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
    if (rawParts.length > 1) {
      rawParts.forEach(pushUnique);
      continue;
    }

    // Role đơn — dùng nhãn localize (có thể vẫn chứa "/")
    roleLabel(role)
      .split(/\s*\/\s*/)
      .forEach(pushUnique);
  }

  return parts;
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
  // Legend: đỏ Manager | be Leader | xanh lá Giám đốc | còn lại xám / trung tính
  const roleStr = (role || "").trim();
  if (roleStr.includes("Manager") || roleStr.includes("PM") || roleStr.includes("Owner") || roleStr.includes("Group Member") || roleStr === "GM" || isManagerRole(roleStr)) {
    return "critical" as const;
  }
  if (isDirectorRole(roleStr)) {
    return "on-track" as const;
  }
  if (roleStr.includes("Leader") || isLeaderRole(roleStr)) {
    return "watch" as const;
  }
  if (roleStr === "HR") {
    return "todo" as const;
  }
  if (roleStr === "Trợ lý giám đốc" || roleStr === "Kỹ sư cầu nối" || roleStr === "Comtor") {
    return "progress" as const;
  }
  return "neutral" as const;
}

export function isHeadOfDevDepartment(department?: string | null) {
  return (department || "").trim() === HEAD_OF_DEV_DEPARTMENT;
}

/**
 * Thứ tự cấp bậc Nhân sự (thấp hơn = cao hơn):
 * 0 Giám đốc
 * 1 PM/PO/GM phòng Head of Dev
 * 2 PM/PO/GM các dự án
 * 3 Leader
 * 4 còn lại
 */
export function personnelRank(role?: string | null, department?: string | null) {
  const roleName = (role || "").trim();
  const departmentName = (department || "").trim();

  if (isDirectorRole(roleName)) return 0;
  if (isManagerRole(roleName) && isHeadOfDevDepartment(departmentName)) return 1;
  if (isManagerRole(roleName)) return 2;
  if (isLeaderRole(roleName)) return 3;
  return 4;
}

export function comparePersonnelByRank(
  left: { role?: string | null; department?: string | null; name?: string | null },
  right: { role?: string | null; department?: string | null; name?: string | null },
) {
  const rankDiff = personnelRank(left.role, left.department) - personnelRank(right.role, right.department);
  if (rankDiff !== 0) return rankDiff;

  const roleDiff = (left.role || "").localeCompare(right.role || "", "vi", { sensitivity: "base" });
  if (roleDiff !== 0) return roleDiff;

  return (left.name || "").localeCompare(right.name || "", "vi");
}

export function hasCompanywideProjectAccess(
  role: UserRole,
  department?: string | null,
) {
  return isDirectorRole(role) || isHeadOfDevDepartment(department);
}

export function canManageUsers(role: UserRole, isAdmin?: boolean) {
  return isAdmin ?? isAdminRole(role);
}

export function canAccessTeamDirectoryRole(
  role: UserRole,
  _department?: string | null,
  isAdmin?: boolean,
) {
  // Admin (quản trị TK) + PM/PO/GM + Giám đốc + Leader
  return (
    canManageUsers(role, isAdmin) ||
    isDirectorRole(role) ||
    isManagerRole(role) ||
    isLeaderRole(role)
  );
}

export function canAccessLogworkApprovalsRole(role: UserRole) {
  // Chỉ PM/PO/GM + Giám đốc + Leader
  return isDirectorRole(role) || isManagerRole(role) || isLeaderRole(role);
}

export function canDeleteTaskRole(
  role: UserRole | undefined,
  department?: string | null,
) {
  if (!role) return false;
  return (
    isAdminRole(role) ||
    isDirectorRole(role) ||
    isHeadOfDevDepartment(department) ||
    isManagerRole(role) ||
    isLeaderRole(role)
  );
}

export function canEditPendingLogwork(
  status: string | undefined,
  entryUserId: string | undefined,
  viewerId: string | undefined,
) {
  if ((status || "PENDING").toUpperCase() !== "PENDING") {
    return false;
  }
  const ownerId = (entryUserId || "").replace(/^usr-/, "");
  const actorId = (viewerId || "").replace(/^usr-/, "");
  return Boolean(ownerId && actorId && ownerId === actorId);
}

export type LogworkStatus = "PENDING" | "APPROVED" | "REJECTED";

export function normalizeLogworkStatus(status?: string | null): LogworkStatus {
  const normalized = (status || "PENDING").toUpperCase();
  if (normalized === "APPROVED" || normalized === "REJECTED") return normalized;
  return "PENDING";
}

export function logworkStatusLabel(status?: string | null) {
  switch (normalizeLogworkStatus(status)) {
    case "APPROVED":
      return "Đã duyệt";
    case "REJECTED":
      return "Từ chối";
    default:
      return "Đang chờ";
  }
}

export function logworkStatusClassName(status?: string | null) {
  switch (normalizeLogworkStatus(status)) {
    case "APPROVED":
      return "logwork-status-approved";
    case "REJECTED":
      return "logwork-status-rejected";
    default:
      return "logwork-status-pending";
  }
}

export function canCreateProjects(
  role: UserRole,
  department?: string | null,
) {
  // PM/PO/GM, Giám đốc, hoặc mọi thành viên phòng Head of Dev.
  return (
    !isAdminRole(role) &&
    (hasCompanywideProjectAccess(role, department) || isManagerRole(role))
  );
}

export function canManageProjectsByRole(
  role: UserRole,
  department?: string | null,
) {
  return hasCompanywideProjectAccess(role, department) || isManagerRole(role) || isLeaderRole(role);
}

/** PM, Leader, Giám đốc, Head of Dev, Admin: xem task team + nhật ký logwork trên Dashboard tổng. */
export function canViewGlobalDashboardTeamActivity(
  role: UserRole,
  department?: string | null,
) {
  return (
    isAdminRole(role) ||
    hasCompanywideProjectAccess(role, department) ||
    isManagerRole(role) ||
    isLeaderRole(role)
  );
}

/** Chỉ PM/PO/GM hoặc Leader đang là thành viên của đúng dự án đó được tạo/sửa sprint. */
export function canManageProjectSprints(
  viewer: { id: string; role: UserRole },
  project: { managerId?: string | null; memberIds?: string[] | null },
) {
  const viewerId = String(viewer.id);
  const managerId = project.managerId ? String(project.managerId) : "";
  const memberIds = project.memberIds ?? [];
  const isMember =
    managerId === viewerId || memberIds.some((id) => String(id) === viewerId);
  return isMember && (isManagerRole(viewer.role) || isLeaderRole(viewer.role));
}

/** Aligns with backend `user_can_manage_project`: any PM/PO/GM (or Leader) who is a member can manage, not only `manager_id`. */
export function canManageProjectMembership(
  viewer: { id: string; role: UserRole; department?: string | null },
  project: { managerId?: string | null; memberIds?: string[] | null },
) {
  if (hasCompanywideProjectAccess(viewer.role, viewer.department)) {
    return true;
  }

  const viewerId = String(viewer.id);
  const managerId = project.managerId ? String(project.managerId) : "";
  const memberIds = project.memberIds ?? [];
  const isMember = managerId === viewerId || memberIds.includes(viewerId);

  return isMember && (isManagerRole(viewer.role) || isLeaderRole(viewer.role));
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
      return "#fef9c3";
    case "IN_PROGRESS":
      return "#dbeafe";
    case "DONE":
      return "#dcfce7";
    default:
      return "var(--surface)";
  }
}

export function taskStatusLabel(status: TaskStatus) {
  return {
    TODO: "Cần làm",
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

/** Chuẩn hóa priority từ draft AI (lowercase) hoặc API (UPPERCASE). */
export function normalizeTaskPriority(
  priority: string | null | undefined,
): TaskPriority {
  const key = String(priority || "MEDIUM").toUpperCase();
  if (key === "LOW" || key === "HIGH" || key === "CRITICAL") return key;
  return "MEDIUM";
}

/**
 * Màu pill cấp thiết — khớp Gantt (`.priorityLow` / Medium / High / Critical).
 */
export function taskPriorityPillStyle(priority: string | null | undefined): {
  color: string;
  backgroundColor: string;
  borderColor: string;
} {
  switch (normalizeTaskPriority(priority)) {
    case "LOW":
      return { color: "#0369a1", backgroundColor: "#e0f2fe", borderColor: "#bae6fd" };
    case "HIGH":
      return { color: "#b45309", backgroundColor: "#fef3c7", borderColor: "#fde68a" };
    case "CRITICAL":
      return { color: "#b91c1c", backgroundColor: "#fee2e2", borderColor: "#fecaca" };
    case "MEDIUM":
    default:
      return { color: "#15803d", backgroundColor: "#dcfce7", borderColor: "#bbf7d0" };
  }
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

export function formatEmployeeCode(codeOrId: string | undefined | null) {
  if (!codeOrId) return "";
  const str = String(codeOrId);
  if (str.startsWith("usr-")) {
    const numStr = str.replace("usr-", "");
    return `APMS-${numStr.padStart(4, "0")}`;
  }
  return str;
}
