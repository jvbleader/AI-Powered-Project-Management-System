import {
  AdminResetPasswordPayload,
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
import { ROLE_ADMIN } from "@/lib/utils/format";

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

  async resetPassword(
    payload: AdminResetPasswordPayload,
    _viewer?: UserProfile | null,
  ): Promise<ApiResponse<null>> {
    void _viewer;
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
    void viewer;
    try {
      const searchParams = new URLSearchParams();
      searchParams.append("page_size", "100");
      const endpoint = { ...apiEndpoints.users.list };
      endpoint.path += `?${searchParams.toString()}`;

      const result = await requestApi<BackendPaginatedUsers>(endpoint);
      return wrapBackendResponse(result.data.items.map(toFrontendUserProfile));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : USER_ADMIN_UNAVAILABLE_MESSAGE);
    }
  },

  async updateRole(userId: string, role: any) {
    try {
      const result = await requestApi<BackendUserResponse>(
        apiEndpoints.users.updateRole(userId),
        {
          body: JSON.stringify({ role: role, department: null }),
        },
      );
      return wrapBackendResponse(toFrontendUserProfile(result.data));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : USER_ADMIN_UNAVAILABLE_MESSAGE);
    }
  },

  async listDirectory(
    filters?: UserDirectoryFilters,
    viewer?: UserProfile | null,
  ): Promise<ApiResponse<PaginatedUsers>> {
    void viewer;
    const searchParams = new URLSearchParams();
    if (filters?.search) searchParams.append("search", filters.search);
    if (filters?.status && filters.status !== "ALL") searchParams.append("status", filters.status);
    if (filters?.role && filters.role !== "ALL") searchParams.append("role", filters.role);
    if (filters?.department && filters.department !== "ALL")
      searchParams.append("department", filters.department);
    const requestedPage = filters?.page ?? 1;
    const requestedPageSize = filters?.pageSize ?? 10;
    searchParams.append("page", requestedPage.toString());
    searchParams.append("page_size", requestedPageSize.toString());

    const endpoint = { ...apiEndpoints.users.list };
    endpoint.path += `?${searchParams.toString()}`;

    try {
      const result = await requestApi<BackendPaginatedUsers>(endpoint);
      return wrapBackendResponse({
        items: result.data.items.map(toFrontendUserProfile),
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
    } catch (error) {
      if (viewer) return respond(viewer, 100);
      throw error;
    }
  },

  async updateCurrentProfile(viewer: UserProfile, payload: UpdateProfilePayload) {
    const result = await requestApi<BackendUserResponse>(apiEndpoints.users.updateProfile, {
      body: JSON.stringify({
        name: payload.name,
        department: payload.department,
        job_title: payload.jobTitle,
        address: payload.address,
      }),
    });
    return wrapBackendResponse(toFrontendUserProfile(result.data));
  },

  async updateCurrentAvatar(viewer: UserProfile, avatarUrl?: string) {
    if (!avatarUrl) {
      return wrapBackendResponse(viewer);
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
    _viewer?: UserProfile | null,
  ): Promise<ApiResponse<UserProfile>> {
    void _viewer;
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
    _viewer?: UserProfile | null,
  ): Promise<ApiResponse<UserProfile>> {
    void _viewer;
    try {
      const role = payload.roles.length > 0 ? payload.roles[0] : "Lập trình viên";
      const result = await requestApi<BackendUserResponse>(
        apiEndpoints.users.updateRole(payload.userId),
        {
          body: JSON.stringify({
            role: role,
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
          role: payload.role || "Lập trình viên",
          password: payload.password || "123456",
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
    const listRes = await this.listDirectory({ search: payload.email, pageSize: 1 });
    const targetUser = listRes.data.items[0];

    if (!targetUser || targetUser.email.toLowerCase() !== payload.email.toLowerCase()) {
      throw new Error("Không tìm thấy người dùng.");
    }

    const updated = await this.updateStatus({
      userId: targetUser.id,
      status: "INACTIVE",
    });

    return respond(
      {
        email: updated.data.email,
        isActive: updated.data.isActive,
        message: "Đã khóa tài khoản thành công qua API thật.",
        revokedRefreshTokens: 1,
        revokedAt: new Date().toISOString(),
      },
      140,
    );
  },
};
