"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuthSession } from "@/hooks/use-session";
import { getApiBaseUrl } from "@/services/api/core";
import { getNotifications, markNotificationAsRead, getWsToken } from "@/services/api/notifications";
import { forceSignOut } from "@/services/auth/session";

export type NotificationType = "TASK_ASSIGNED" | "LOGWORK_SUBMITTED";

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
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch initial notifications
  useEffect(() => {
    if (!session) return;

    getNotifications()
      .then((res) => {
        const data = res.data;
        if (Array.isArray(data)) {
          setNotifications(data);
          setUnreadCount(data.filter((n: Notification) => !n.is_read).length);
        }
      })
      .catch(err => console.error("Failed to load notifications:", err));
  }, [session]);

  // WebSocket Connection
  useEffect(() => {
    if (!session) return;

    let ws: WebSocket;
    let isMounted = true;

    getWsToken().then(res => {
      if (!isMounted) return;
      
      const token = res.data.token;
      let base = getApiBaseUrl();
      if (!base.startsWith('http')) {
        base = window.location.origin + base;
      }
      const wsUrl = base.replace(/^http/, 'ws');
      ws = new WebSocket(`${wsUrl}/api/notifications/ws?token=${token}`);

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "NEW_NOTIFICATION") {
            setNotifications(prev => [message.data, ...prev]);
            setUnreadCount(prev => prev + 1);
            
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('new_notification', { detail: message.data }));
            }
          } else if (message.type === "FORCE_LOGOUT") {
            forceSignOut();
          }
        } catch (err) {
          console.error("Failed to parse WS message", err);
        }
      };

      ws.onerror = () => {
        // Silently handle WebSocket disconnect/reconnect attempt
      };
    }).catch(() => {
      // Ignore WS token fetch error if user is logging out/changing page
    });

    return () => {
      isMounted = false;
      if (ws) ws.close();
    };
  }, [session]);

  const markAsRead = async (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    
    if (session) {
      markNotificationAsRead(id).catch(err => console.error("Failed to mark as read", err));
    }
  };

  const markAllAsRead = () => {
    // In a real app, you'd also call an API to mark all as read
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
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
