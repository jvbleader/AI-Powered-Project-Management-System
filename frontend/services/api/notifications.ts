import { apiEndpoints, requestApi } from "./core";

export function getNotifications() {
  return requestApi<any[]>({ method: "GET", path: "/api/notifications" });
}

export function markNotificationAsRead(id: number) {
  return requestApi<any>({ method: "PUT", path: `/api/notifications/${id}/read` });
}

export function getWsToken() {
  return requestApi<{ token: string }>({ method: "GET", path: "/api/notifications/ws-token" });
}
