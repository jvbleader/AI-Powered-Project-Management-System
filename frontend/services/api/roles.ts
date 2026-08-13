import type { ApiResponse, RolePayload, SystemRole } from "@/types";
import { requestApi, wrapBackendResponse } from "./core";

type BackendRole = {
  id: number;
  name: string;
  description?: string | null;
  is_admin?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  user_count?: number;
};

export function toFrontendRole(raw: BackendRole): SystemRole {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    isAdmin: Boolean(raw.is_admin),
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
    userCount: raw.user_count ?? 0,
  };
}

export const roleApi = {
  async list(): Promise<ApiResponse<SystemRole[]>> {
    try {
      const result = await requestApi<BackendRole[]>({ method: "GET", path: "/api/roles" });
      return wrapBackendResponse((result.data || []).map(toFrontendRole));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Không thể tải danh sách vai trò.");
    }
  },

  async create(payload: RolePayload): Promise<ApiResponse<SystemRole>> {
    try {
      const result = await requestApi<BackendRole>(
        { method: "POST", path: "/api/roles" },
        {
          body: JSON.stringify({
            name: payload.name,
            description: payload.description ?? null,
            is_admin: Boolean(payload.isAdmin),
          }),
        },
      );
      return wrapBackendResponse(toFrontendRole(result.data));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Không thể tạo vai trò.");
    }
  },

  async update(roleId: number, payload: RolePayload): Promise<ApiResponse<SystemRole>> {
    try {
      const result = await requestApi<BackendRole>(
        { method: "PATCH", path: `/api/roles/${roleId}` },
        {
          body: JSON.stringify({
            name: payload.name,
            description: payload.description ?? null,
            is_admin: Boolean(payload.isAdmin),
          }),
        },
      );
      return wrapBackendResponse(toFrontendRole(result.data));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Không thể cập nhật vai trò.");
    }
  },

  async remove(roleId: number): Promise<ApiResponse<null>> {
    try {
      await requestApi({ method: "DELETE", path: `/api/roles/${roleId}` });
      return wrapBackendResponse(null);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Không thể xóa vai trò.");
    }
  },
};
