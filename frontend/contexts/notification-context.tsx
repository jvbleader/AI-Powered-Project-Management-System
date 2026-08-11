"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuthSession } from "@/hooks/use-session";
import { getApiBaseUrl } from "@/services/api/core";
import {
  getNotifications,
  markNotificationAsRead,
  getWsToken,
  markAllNotificationsAsRead,
} from "@/services/api/notifications";
import { forceSignOut } from "@/services/auth/session";

export type NotificationType =
  | "TASK_ASSIGNED"
  | "TASK_UNASSIGNED"
  | "TASK_UPDATED"
  | "LOGWORK_SUBMITTED"
  | "LOGWORK_APPROVED"
  | "LOGWORK_REJECTED"
  | string;

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  content: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const session = useAuthSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  // Fetch initial notifications
  useEffect(() => {
    if (!session) return;

    getNotifications()
      .then((res) => {
        const data = res.data;
        if (Array.isArray(data)) {
          setNotifications(data);
        }
      })
      .catch((err) => console.error("Failed to load notifications:", err));
  }, [session]);

  // WebSocket Connection
  useEffect(() => {
    if (!session) return;

    let ws: WebSocket;
    let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt = 0;

    const scheduleReconnect = () => {
      if (!isMounted || reconnectTimer) return;
      const delay = Math.min(1_000 * 2 ** reconnectAttempt, 10_000);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        void connect();
      }, delay);
    };

    const connect = async () => {
      try {
        const res = await getWsToken();
        if (!isMounted) return;

        const token = res.data.token;
        let base = getApiBaseUrl();
        if (!base.startsWith("http")) {
          base = window.location.origin + base;
        }
        const wsUrl = base.replace(/^http/, "ws");
        ws = new WebSocket(`${wsUrl}/api/notifications/ws?token=${token}`);

        ws.onopen = () => {
          reconnectAttempt = 0;
          getNotifications()
            .then((response) => {
              if (!isMounted || !Array.isArray(response.data)) return;
              setNotifications((current) => {
                const freshIds = new Set(response.data.map((notification) => notification.id));
                return [
                  ...response.data,
                  ...current.filter((notification) => !freshIds.has(notification.id)),
                ];
              });
            })
            .catch(() => {});
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "NEW_NOTIFICATION") {
              setNotifications((prev) => {
                if (prev.some((notification) => notification.id === message.data.id)) return prev;
                return [message.data, ...prev];
              });

              window.dispatchEvent(new CustomEvent("new_notification", { detail: message.data }));
            } else if (message.type === "FORCE_LOGOUT") {
              forceSignOut();
            }
          } catch (err) {
            console.error("Failed to parse WS message", err);
          }
        };

        ws.onerror = () => ws.close();
        ws.onclose = scheduleReconnect;
      } catch {
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [session]);

  const markAsRead = async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));

    if (session) {
      markNotificationAsRead(id).catch((err) => console.error("Failed to mark as read", err));
    }
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    if (session) {
      markAllNotificationsAsRead().catch((err) => console.error("Failed to mark all as read", err));
    }
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
