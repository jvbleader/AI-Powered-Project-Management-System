import type { PresenceStatus } from "./common";

export type UserRole = "ADMIN" | "MANAGER" | "LEADER" | "MEMBER";
export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "LOCKED";

export type JobRole =
  | "FULLSTACK"
  | "BACKEND"
  | "FRONTEND"
  | "AI_ENGINEER"
  | "QA"
  | "DEVOPS"
  | "UI_UX"
  | "PROJECT_MANAGER";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roles?: UserRole[];
  title: string;
  initials: string;
  avatarUrl?: string;
  presence: PresenceStatus;
  capacityHours: number;
  workloadHours: number;
  focusScore: number;
  isActive: boolean;
  status?: UserStatus;
  employeeCode?: string;
  phoneNumber?: string;
  department?: string;
  jobTitle?: string;
  address?: string;
  lastLoginAt?: string;
  lastUpdatedAt?: string;
}

export interface UpdateProfilePayload {
  name: string;
  phoneNumber: string;
  department: string;
  jobTitle: string;
  address: string;
}

export interface UserDirectoryFilters {
  search?: string;
  status?: UserStatus | "ALL";
  role?: UserRole | "ALL";
  page?: number;
  pageSize?: number;
}

export interface PaginatedUsers {
  items: UserProfile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UserStatusUpdatePayload {
  userId: string;
  status: UserStatus;
}

export interface UserRolesUpdatePayload {
  userId: string;
  roles: UserRole[];
}

export interface CreateUserPayload {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  isAdmin: boolean;
}

export interface AdminResetPasswordPayload {
  email: string;
  newPassword: string;
}

export interface AdminDeactivateUserPayload {
  email: string;
}
