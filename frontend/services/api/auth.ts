import { AuthSession, ChangePasswordPayload, LoginPayload, UserProfile } from "@/types";
import {
  apiEndpoints,
  fetchCurrentUserProfile,
  requestApi,
  toAuthSession,
  wrapBackendResponse,
} from "./core";

export const authApi = {
  async login(payload: LoginPayload, options?: { remember?: boolean }) {
    await requestApi<{ message: string; user_id: number }>(apiEndpoints.auth.login, {
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        remember_me: Boolean(options?.remember),
      }),
    });

    const currentUser = await fetchCurrentUserProfile();
    return wrapBackendResponse(toAuthSession(currentUser));
  },

  async refresh() {
    await requestApi<{ message: string; user_id: number }>(apiEndpoints.auth.refresh);
    const currentUser = await fetchCurrentUserProfile();
    return wrapBackendResponse(toAuthSession(currentUser));
  },

  async restoreSession() {
    try {
      const currentUser = await fetchCurrentUserProfile();
      return wrapBackendResponse(toAuthSession(currentUser));
    } catch {
      await requestApi<{ message: string; user_id: number }>(apiEndpoints.auth.refresh);
      const currentUser = await fetchCurrentUserProfile();
      return wrapBackendResponse(toAuthSession(currentUser));
    }
  },

  async logout() {
    try {
      return await requestApi<{ message: string }>(apiEndpoints.auth.logout, {
        body: JSON.stringify({}),
      });
    } catch (error) {
      await requestApi<{ message: string; user_id: number }>(apiEndpoints.auth.refresh);
      try {
        return await requestApi<{ message: string }>(apiEndpoints.auth.logout, {
          body: JSON.stringify({}),
        });
      } catch {
        throw error;
      }
    }
  },

  async me() {
    const currentUser = await fetchCurrentUserProfile();
    return wrapBackendResponse(currentUser);
  },

  async changePassword(_session: AuthSession, payload: ChangePasswordPayload) {
    return requestApi<{ message: string }>(apiEndpoints.auth.changePassword, {
      body: JSON.stringify({
        old_password: payload.currentPassword,
        new_password: payload.newPassword,
      }),
    });
  },
};
