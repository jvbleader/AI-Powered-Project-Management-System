import { apiEndpoints, requestApi } from "./core";

export function getNotifications(limit = 100) {
  return requestApi<any[]>({ method: "GET", path: `/api/notifications?limit=${limit}` });
}

export function markNotificationAsRead(id: number) {
  return requestApi<any>({ method: "PUT", path: `/api/notifications/${id}/read` });
}

export function getWsToken() {
  return requestApi<{ token: string }>({ method: "GET", path: "/api/notifications/ws-token" });
}

export function markAllNotificationsAsRead() {
  return requestApi<any>({ method: "PUT", path: "/api/notifications/read-all" });
}
