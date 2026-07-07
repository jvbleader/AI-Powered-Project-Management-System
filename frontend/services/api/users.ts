import {
  AdminDeactivateUserPayload,
  ApiResponse,
  CreateUserPayload,
  Department,
  PaginatedUsers,
  UpdateProfilePayload,
  UserDirectoryFilters,
  UserProfile,
  UserRolesUpdatePayload,
  UserStatusUpdatePayload,
} from "@/types";
import { users } from "@/lib/mock/data";
import { isPrivilegedUser, normalizeViewer } from "@/lib/mock/permissions";
import {
  getDirectoryUsers,
  updateDirectoryProfile,
  updateDirectoryUserRoles,
  updateDirectoryUserStatus,
} from "@/services/users/directory";
import {
  apiEndpoints,
  BackendPaginatedUsers,
  BackendUserResponse,
  requestApi,
  respond,
  toFrontendUserProfile,
  USER_ADMIN_UNAVAILABLE_MESSAGE,
  wrapBackendResponse,
} from "./core";

export const userApi = {
  async getDepartments(): Promise<ApiResponse<Department[]>> {
    try {
      const result = await requestApi<Department[]>({ method: "GET", path: "/api/departments" });
      return wrapBackendResponse(result.data);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Không thể tải danh sách phòng ban.",
      );
    }
  },

  async resetPassword(payload: any, viewer?: UserProfile | null): Promise<ApiResponse<null>> {
    try {
      await requestApi(apiEndpoints.users.resetPassword, {
        body: JSON.stringify({ email: payload.email, new_password: payload.newPassword }),
      });
      return wrapBackendResponse(null);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : USER_ADMIN_UNAVAILABLE_MESSAGE);
    }
  },

  async list(viewer?: UserProfile | null): Promise<ApiResponse<UserProfile[]>> {
    try {
      const searchParams = new URLSearchParams();
      searchParams.append("page_size", "100");
      const endpoint = { ...apiEndpoints.users.list };
      endpoint.path += `?${searchParams.toString()}`;

      const result = await requestApi<BackendPaginatedUsers>(endpoint);
      const frontendItems = result.data.items.map(toFrontendUserProfile);

      const currentViewer = normalizeViewer(viewer);
      const visibleUsers = isPrivilegedUser(currentViewer)
        ? frontendItems
        : frontendItems.filter(
            (user) => user.email.toLowerCase() === currentViewer.email.toLowerCase(),
          );

      return wrapBackendResponse(visibleUsers);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : USER_ADMIN_UNAVAILABLE_MESSAGE);
    }
  },

  async updateRole(userId: string, role: (typeof users)[number]["role"]) {
    const updated = updateDirectoryUserRoles({ userId, roles: [role] });
    return respond(updated, 150);
  },

  async listDirectory(
    filters?: UserDirectoryFilters,
    viewer?: UserProfile | null,
  ): Promise<ApiResponse<PaginatedUsers>> {
    const searchParams = new URLSearchParams();
    if (filters?.search) searchParams.append("search", filters.search);
    if (filters?.status && filters.status !== "ALL") searchParams.append("status", filters.status);
    if (filters?.role && filters.role !== "ALL") searchParams.append("role", filters.role);
    if (filters?.department && filters.department !== "ALL")
      searchParams.append("department", filters.department);
    if (filters?.page) searchParams.append("page", filters.page.toString());
    if (filters?.pageSize) searchParams.append("page_size", filters.pageSize.toString());

    const endpoint = { ...apiEndpoints.users.list };
    endpoint.path += `?${searchParams.toString()}`;

    try {
      const result = await requestApi<BackendPaginatedUsers>(endpoint);
      const frontendItems = result.data.items.map(toFrontendUserProfile);

      return wrapBackendResponse({
        items: frontendItems,
        total: result.data.total,
        page: result.data.page,
        pageSize: result.data.pageSize,
        totalPages: result.data.totalPages,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : USER_ADMIN_UNAVAILABLE_MESSAGE);
    }
  },

  async getCurrentProfile(viewer?: UserProfile | null): Promise<ApiResponse<UserProfile>> {
    try {
      const result = await requestApi<BackendUserResponse>(apiEndpoints.auth.me);
      return wrapBackendResponse(toFrontendUserProfile(result.data));
    } catch {
      return respond(normalizeViewer(viewer), 100);
    }
  },

  async updateCurrentProfile(viewer: UserProfile, payload: UpdateProfilePayload) {
    const updated = updateDirectoryProfile(normalizeViewer(viewer), payload);
    return respond(updated, 140);
  },

  async updateCurrentAvatar(viewer: UserProfile, avatarUrl?: string) {
    if (!avatarUrl) {
      return respond(normalizeViewer(viewer), 120);
    }
    const result = await requestApi<BackendUserResponse>(apiEndpoints.users.updateAvatar, {
      body: JSON.stringify({ avatar_url: avatarUrl }),
    });
    return wrapBackendResponse(toFrontendUserProfile(result.data));
  },

  async updatePhone(phoneNumber: string) {
    const result = await requestApi<BackendUserResponse>(apiEndpoints.users.updatePhone, {
      body: JSON.stringify({ phone_number: phoneNumber }),
    });
    const updatedUser = toFrontendUserProfile(result.data);
    return wrapBackendResponse(updatedUser);
  },

  async updateStatus(
    payload: UserStatusUpdatePayload,
    viewer?: UserProfile | null,
  ): Promise<ApiResponse<UserProfile>> {
    try {
      const result = await requestApi<BackendUserResponse>(
        apiEndpoints.users.updateStatus(payload.userId),
        {
          body: JSON.stringify({ is_active: payload.status === "ACTIVE" }),
        },
      );
      return wrapBackendResponse(toFrontendUserProfile(result.data));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : USER_ADMIN_UNAVAILABLE_MESSAGE);
    }
  },

  async updateRoles(
    payload: UserRolesUpdatePayload,
    viewer?: UserProfile | null,
  ): Promise<ApiResponse<UserProfile>> {
    try {
      const role = payload.roles.length > 0 ? payload.roles[0] : "MEMBER";
      const result = await requestApi<BackendUserResponse>(
        apiEndpoints.users.updateRole(payload.userId),
        {
          body: JSON.stringify({
            role: role,
            is_admin: role === "ADMIN",
            department: payload.department || null,
          }),
        },
      );
      return wrapBackendResponse(toFrontendUserProfile(result.data));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : USER_ADMIN_UNAVAILABLE_MESSAGE);
    }
  },

  async create(payload: CreateUserPayload): Promise<ApiResponse<UserProfile>> {
    try {
      const result = await requestApi<BackendUserResponse>(apiEndpoints.users.create, {
        body: JSON.stringify({
          name: payload.name,
          email: payload.email,
          role: payload.role || "MEMBER",
          is_admin: payload.isAdmin || false,
          password: payload.password || "default1234",
          department: payload.department || null,
        }),
      });
      return wrapBackendResponse(toFrontendUserProfile(result.data));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : USER_ADMIN_UNAVAILABLE_MESSAGE);
    }
  },

  async deactivate(payload: AdminDeactivateUserPayload): Promise<
    ApiResponse<{
      email: string;
      isActive: boolean;
      message: string;
      revokedRefreshTokens: number;
      revokedAt: string | null;
    }>
  > {
    const targetUser = getDirectoryUsers().find(
      (user) => user.email.toLowerCase() === payload.email.toLowerCase(),
    );

    if (!targetUser) {
      throw new Error("Không tìm thấy người dùng trong danh sách preview.");
    }

    const updated = updateDirectoryUserStatus({
      userId: targetUser.id,
      status: "INACTIVE",
    });

    return respond(
      {
        email: updated.email,
        isActive: updated.isActive,
        message: "Đã khóa tài khoản trong chế độ preview của frontend.",
        revokedRefreshTokens: 0,
        revokedAt: new Date().toISOString(),
      },
      140,
    );
  },
};
