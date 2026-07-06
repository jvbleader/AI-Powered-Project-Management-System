import { users as seedUsers } from "@/lib/mock/data";
import { readStoredAvatar } from "@/lib/utils/avatar";
import type {
  CreateUserPayload,
  PaginatedUsers,
  UpdateProfilePayload,
  UserDirectoryFilters,
  UserProfile,
  UserRole,
  UserStatus,
} from "@/types";

const STORAGE_KEY = "flowpilot-user-directory-v1";
const DEFAULT_PAGE_SIZE = 8;

const ROLE_PRIORITY: Record<UserRole, number> = {
  ADMIN: 0,
  MANAGER: 1,
  LEADER: 2,
  MEMBER: 3,
};

const ROLE_TITLES: Record<UserRole, string> = {
  ADMIN: "Platform Admin",
  MANAGER: "Project Manager",
  LEADER: "Team Lead",
  MEMBER: "Team Member",
};

const ROLE_DEPARTMENTS: Record<UserRole, string> = {
  ADMIN: "Operations",
  MANAGER: "Project Delivery",
  LEADER: "Engineering",
  MEMBER: "Product Team",
};

function buildInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "NA";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function buildEmployeeCode(index: number) {
  return `FP-${String(index + 1).padStart(3, "0")}`;
}

function sortRoles(roles: UserRole[]) {
  return [...new Set(roles)].sort((left, right) => ROLE_PRIORITY[left] - ROLE_PRIORITY[right]);
}

function getPrimaryRole(roles: UserRole[]) {
  return sortRoles(roles)[0] ?? "MEMBER";
}

function getFallbackPresence(status: UserStatus, focusScore: number) {
  if (status !== "ACTIVE") {
    return "offline";
  }

  return focusScore >= 85 ? "focus" : "online";
}

function normalizeUserProfile(user: Partial<UserProfile> & Pick<UserProfile, "id" | "name" | "email">) {
  const roles = sortRoles(
    (user.roles?.length ? user.roles : user.role ? [user.role] : ["MEMBER"]) as UserRole[],
  );
  const role = getPrimaryRole(roles);
  const status = user.status ?? (user.isActive === false ? "INACTIVE" : "ACTIVE");
  const name = user.name.trim() || user.email.split("@")[0] || "Người dùng";
  const avatarUrl = user.avatarUrl ?? readStoredAvatar(user.id) ?? undefined;
  const jobTitle = user.jobTitle?.trim() || user.title?.trim() || ROLE_TITLES[role];

  return {
    id: user.id,
    name,
    email: user.email.trim().toLowerCase(),
    role,
    roles,
    title: user.title?.trim() || jobTitle,
    initials: user.initials?.trim() || buildInitials(name),
    avatarUrl,
    presence: user.presence ?? getFallbackPresence(status, user.focusScore ?? 75),
    capacityHours: user.capacityHours ?? 40,
    workloadHours: user.workloadHours ?? 0,
    focusScore: user.focusScore ?? 75,
    isActive: status === "ACTIVE",
    status,
    employeeCode: user.employeeCode?.trim(),
    phoneNumber: user.phoneNumber?.trim() ?? "",
    department: user.department?.trim() || ROLE_DEPARTMENTS[role],
    jobTitle,
    address: user.address?.trim() ?? "",
    lastLoginAt: user.lastLoginAt,
    lastUpdatedAt: user.lastUpdatedAt ?? new Date().toISOString(),
  } satisfies UserProfile;
}

function buildSeedDirectory() {
  return seedUsers.map((user, index) =>
    normalizeUserProfile({
      ...user,
      roles: [user.role],
      status: user.isActive ? "ACTIVE" : "INACTIVE",
      employeeCode: buildEmployeeCode(index),
      phoneNumber: `090${String(index + 1).padStart(7, "0")}`,
      department: ROLE_DEPARTMENTS[user.role],
      jobTitle: user.title,
      address: "Ho Chi Minh City",
      lastLoginAt: "2026-06-29T09:00:00Z",
      lastUpdatedAt: "2026-06-29T12:00:00Z",
    }),
  );
}

function readStoredDirectory() {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as UserProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredDirectory(users: UserProfile[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      window.localStorage.clear();
      window.sessionStorage.clear();
      // Ignore saving if we still can't save
    }
  }
}

function matchUser(left: Pick<UserProfile, "id" | "email">, right: Pick<UserProfile, "id" | "email">) {
  return left.id === right.id || left.email.toLowerCase() === right.email.toLowerCase();
}

function mergeUsers(baseUsers: UserProfile[], incomingUsers: UserProfile[]) {
  const merged = [...baseUsers];

  for (const incoming of incomingUsers) {
    const index = merged.findIndex((entry) => matchUser(entry, incoming));
    if (index >= 0) {
      merged[index] = normalizeUserProfile({
        ...merged[index],
        ...incoming,
        roles: incoming.roles?.length ? incoming.roles : merged[index].roles,
        avatarUrl: incoming.avatarUrl ?? merged[index].avatarUrl,
      });
      continue;
    }

    merged.push(normalizeUserProfile(incoming));
  }

  return merged;
}

function syncViewer(users: UserProfile[], viewer?: UserProfile | null) {
  if (!viewer) {
    return users;
  }

  const normalizedViewer = normalizeUserProfile({
    ...viewer,
    roles: viewer.roles?.length ? viewer.roles : [viewer.role],
    status: viewer.status ?? (viewer.isActive ? "ACTIVE" : "INACTIVE"),
  });

  return mergeUsers(users, [normalizedViewer]);
}

function ensureDirectory(viewer?: UserProfile | null) {
  const seeded = buildSeedDirectory();
  const stored = readStoredDirectory().map((user) => normalizeUserProfile(user));
  const merged = syncViewer(mergeUsers(seeded, stored), viewer);

  if (typeof window !== "undefined") {
    writeStoredDirectory(merged);
  }

  return merged;
}

function replaceUser(users: UserProfile[], nextUser: UserProfile) {
  return users.map((user) => (matchUser(user, nextUser) ? nextUser : user));
}

function saveDirectory(users: UserProfile[]) {
  writeStoredDirectory(users);
  return users;
}

function containsSearch(user: UserProfile, search?: string) {
  if (!search) {
    return true;
  }

  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [user.name, user.email, user.employeeCode ?? "", user.department ?? "", user.jobTitle ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(normalizedSearch);
}

export function getDirectoryUsers(viewer?: UserProfile | null) {
  return ensureDirectory(viewer);
}

export function getDirectoryUserById(userId: string, viewer?: UserProfile | null) {
  return ensureDirectory(viewer).find((user) => user.id === userId) ?? null;
}

export function getDirectoryUserByEmail(email: string, viewer?: UserProfile | null) {
  return ensureDirectory(viewer).find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function listDirectoryUsers(filters?: UserDirectoryFilters, viewer?: UserProfile | null): PaginatedUsers {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.max(1, filters?.pageSize ?? DEFAULT_PAGE_SIZE);
  const filtered = ensureDirectory(viewer).filter((user) => {
    if (filters?.status && filters.status !== "ALL" && user.status !== filters.status) {
      return false;
    }

    if (filters?.role && filters.role !== "ALL" && !user.roles?.includes(filters.role)) {
      return false;
    }

    return containsSearch(user, filters?.search);
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    total,
    page: currentPage,
    pageSize,
    totalPages,
  };
}

export function updateDirectoryProfile(
  viewer: UserProfile,
  payload: UpdateProfilePayload,
) {
  const users = ensureDirectory(viewer);
  const currentUser =
    users.find((user) => matchUser(user, viewer)) ?? normalizeUserProfile(viewer);
  const nextUser = normalizeUserProfile({
    ...currentUser,
    name: payload.name,
    phoneNumber: payload.phoneNumber,
    department: payload.department,
    jobTitle: payload.jobTitle,
    title: payload.jobTitle,
    address: payload.address,
    lastUpdatedAt: new Date().toISOString(),
  });

  saveDirectory(replaceUser(users, nextUser));
  return nextUser;
}

export function updateDirectoryAvatar(viewer: UserProfile, avatarUrl?: string) {
  const users = ensureDirectory(viewer);
  const currentUser =
    users.find((user) => matchUser(user, viewer)) ?? normalizeUserProfile(viewer);
  const nextUser = normalizeUserProfile({
    ...currentUser,
    avatarUrl,
    lastUpdatedAt: new Date().toISOString(),
  });

  saveDirectory(replaceUser(users, nextUser));
  return nextUser;
}

export function updateDirectoryUserStatus(
  payload: { userId: string; status: UserStatus },
  viewer?: UserProfile | null,
) {
  const users = ensureDirectory(viewer);
  const target = users.find((user) => user.id === payload.userId);
  if (!target) {
    throw new Error("Không tìm thấy người dùng cần cập nhật trạng thái.");
  }

  const nextUser = normalizeUserProfile({
    ...target,
    status: payload.status,
    isActive: payload.status === "ACTIVE",
    presence: payload.status === "ACTIVE" ? target.presence : "offline",
    lastUpdatedAt: new Date().toISOString(),
  });

  saveDirectory(replaceUser(users, nextUser));
  return nextUser;
}

export function updateDirectoryUserRoles(
  payload: { userId: string; roles: UserRole[] },
  viewer?: UserProfile | null,
) {
  const users = ensureDirectory(viewer);
  const target = users.find((user) => user.id === payload.userId);
  if (!target) {
    throw new Error("Không tìm thấy người dùng cần cập nhật vai trò.");
  }

  const normalizedRoles = sortRoles(payload.roles.length ? payload.roles : ["MEMBER"]);
  const primaryRole = getPrimaryRole(normalizedRoles);
  const nextUser = normalizeUserProfile({
    ...target,
    roles: normalizedRoles,
    role: primaryRole,
    title: target.jobTitle?.trim() || ROLE_TITLES[primaryRole],
    department: target.department?.trim() || ROLE_DEPARTMENTS[primaryRole],
    lastUpdatedAt: new Date().toISOString(),
  });

  saveDirectory(replaceUser(users, nextUser));
  return nextUser;
}

export function createDirectoryUser(payload: CreateUserPayload, viewer?: UserProfile | null) {
  const users = ensureDirectory(viewer);
  const email = payload.email.trim().toLowerCase();

  if (users.some((user) => user.email.toLowerCase() === email)) {
    throw new Error("Email này đã tồn tại trong danh sách preview.");
  }

  const nextUser = normalizeUserProfile({
    id: `usr-local-${Date.now()}`,
    name: payload.name,
    email,
    role: payload.isAdmin ? "ADMIN" : "MEMBER",
    roles: payload.isAdmin ? ["ADMIN"] : ["MEMBER"],
    title: payload.role.replaceAll("_", " "),
    jobTitle: payload.role.replaceAll("_", " "),
    department: payload.isAdmin ? ROLE_DEPARTMENTS.ADMIN : ROLE_DEPARTMENTS.MEMBER,
    employeeCode: buildEmployeeCode(users.length),
    status: "ACTIVE",
    isActive: true,
    presence: "online",
    capacityHours: 40,
    workloadHours: 0,
    focusScore: 70,
    address: "",
    phoneNumber: "",
    lastUpdatedAt: new Date().toISOString(),
  });

  saveDirectory([nextUser, ...users]);
  return nextUser;
}

