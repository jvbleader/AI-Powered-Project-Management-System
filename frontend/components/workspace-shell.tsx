"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { markIntentionalLogout, signOut } from "@/services/auth/session";
import { primeTasksPageData } from "@/services/page-cache/tasks-page";
import { UserAvatar } from "@/components/user-avatar";
import { useAuthSession, PENDING_USER } from "@/hooks/use-session";
import { NavIcon } from "@/components/nav-icon";
import { ChangePasswordModal } from "@/components/change-password-modal";
import { useNotifications } from "@/contexts/notification-context";
import {
  canAccessLogworkApprovalsRole,
  canAccessTeamDirectoryRole,
  isAdminRole,
  roleLabel,
} from "@/lib/utils/format";
import { resolveNotificationLink } from "@/lib/utils/notification-link";
import type { WorkspaceShellData } from "@/types";

const navigation = [
  { href: "/dashboard", label: "Tổng quan", icon: "grid" },
  { href: "/projects", label: "Dự án", icon: "layers" },
  { href: "/tasks", label: "Nhiệm vụ", icon: "kanban" },
  { href: "/logwork", label: "Logwork", icon: "check-circle" },
  { href: "/team", label: "Nhân sự", icon: "users" },
];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function WorkspaceShell({
  shellData,
  heading,
  highlightLabel,
  highlightValue = "",
  headerAction,
  noBottomPadding,
  fillViewport,
  stickyTopbar,
  children,
}: {
  shellData: WorkspaceShellData;
  heading: string;
  subheading: string;
  highlightLabel: string;
  highlightValue: string;
  headerAction?: ReactNode;
  noBottomPadding?: boolean;
  fillViewport?: boolean;
  stickyTopbar?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAuthSession();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeShellData = session
    ? {
      ...shellData,
      currentUser: session.currentUser,
    }
    : shellData;
  const currentUser = activeShellData.currentUser ?? PENDING_USER;
  const currentUserId = currentUser.id;
  const isAdminViewer = Boolean(currentUserId) && isAdminRole(currentUser.role);
  const canViewTeamNavigation = canAccessTeamDirectoryRole(
    currentUser.role,
    currentUser.department,
  );
  const canViewLogworkApprovals = canAccessLogworkApprovalsRole(currentUser.role);
  const sidebarUserTitle = currentUser.department
    ? `${roleLabel(currentUser.role)} - ${currentUser.department}`
    : roleLabel(currentUser.role) || currentUser.title;

  const filteredNavigation = navigation.filter((item) => {
    if (isAdminViewer) {
      if (item.href === "/logwork") return false;
      return item.href === "/team";
    }

    if (item.href === "/logwork") {
      return canViewLogworkApprovals;
    }

    if (item.href === "/team") {
      return canViewTeamNavigation;
    }

    return true;
  });

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    if (
      isAdminViewer &&
      pathname &&
      !pathname.startsWith("/team") &&
      !pathname.startsWith("/profile")
    ) {
      router.replace("/team");
    }
  }, [currentUserId, isAdminViewer, pathname, router]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    if (
      !isAdminViewer &&
      pathname?.startsWith("/logwork") &&
      !canViewLogworkApprovals
    ) {
      router.replace("/dashboard");
    }
  }, [canViewLogworkApprovals, currentUserId, isAdminViewer, pathname, router]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    if (
      !isAdminViewer &&
      pathname?.startsWith("/team") &&
      !canViewTeamNavigation
    ) {
      router.replace("/dashboard");
    }
  }, [canViewTeamNavigation, currentUserId, isAdminViewer, pathname, router]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
        setIsPasswordModalOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    filteredNavigation.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [filteredNavigation, router]);

  useEffect(() => {
    const warmupTimer = window.setTimeout(() => {
      void primeTasksPageData(currentUser);
    }, 250);

    return () => {
      window.clearTimeout(warmupTimer);
    };
  }, [currentUser, currentUserId]);

  const warmTasksPage = () => {
    void primeTasksPageData(currentUser);
  };

  const handleSignOut = async () => {
    setIsProfileMenuOpen(false);
    markIntentionalLogout();
    await signOut();
    window.location.assign("/login");
  };

  const handleOpenPasswordModal = () => {
    setIsProfileMenuOpen(false);
    setIsPasswordModalOpen(true);
  };

  const handleOpenProfile = () => {
    setIsProfileMenuOpen(false);
    router.push("/profile");
  };

  return (
    <div className={classNames("app-shell", fillViewport && "app-shell-fill")}>
      <aside className="sidebar">
        <div className="sidebar-logo-container" style={{ display: "flex", alignItems: "center" }}>
          {/* Typographic Logo */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", userSelect: "none" }}>
            <div style={{ fontSize: "2rem", lineHeight: 1, fontFamily: "var(--font-inter), system-ui, sans-serif", display: "flex", alignItems: "center", letterSpacing: "0.04em" }}>
              <span style={{ color: "#ffffff", fontWeight: 800 }}>AP</span>
              <span style={{ color: "#60a5fa", fontWeight: 500 }}>MS</span>
              
              {/* AI Sparks Accent */}
              <div style={{ display: "flex", gap: "0.1rem", marginLeft: "0.2rem", alignSelf: "flex-start", marginTop: "0.15rem" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="spark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#bfdbfe" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                  <path d="M12 0C12 6.62742 17.3726 12 24 12C17.3726 12 12 17.3726 12 24C12 17.3726 6.62742 12 0 12C6.62742 12 12 6.62742 12 0Z" fill="url(#spark-grad)"/>
                </svg>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginTop: "0.45rem" }}>
                  <path d="M12 0C12 6.62742 17.3726 12 24 12C17.3726 12 12 17.3726 12 24C12 17.3726 6.62742 12 0 12C6.62742 12 12 6.62742 12 0Z" fill="#60a5fa"/>
                </svg>
              </div>
            </div>
            
            <span style={{ fontSize: "0.55rem", color: "#94a3b8", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", lineHeight: 1, fontFamily: "var(--font-inter), system-ui, sans-serif", marginLeft: "0.1rem" }}>
              Smart Projects Management
            </span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {filteredNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.href.slice(1)}`}
              className={classNames(
                "nav-link",
                (pathname === item.href || pathname.startsWith(`${item.href}/`)) && "nav-link-active",
              )}
              onPointerEnter={item.href === "/tasks" ? warmTasksPage : undefined}
              onFocus={item.href === "/tasks" ? warmTasksPage : undefined}
              onPointerDown={item.href === "/tasks" ? warmTasksPage : undefined}
            >
              <NavIcon icon={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main
        className={classNames(
          "workspace-main",
          fillViewport && "workspace-main-fill",
          stickyTopbar && "workspace-main-sticky-topbar",
        )}
        style={!fillViewport && noBottomPadding ? { paddingBottom: 0 } : undefined}
      >
        <header className="topbar">
          <div>
            <h1>{heading}</h1>
          </div>
          <div className="topbar-actions">
            {headerAction}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div ref={notifRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  data-testid="notifications-toggle"
                  title="Thông báo"
                  onClick={() => setIsNotifOpen(!isNotifOpen)}
                  style={{
                    background: "transparent",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: "var(--ink)",
                    transition: "all 0.2s ease",
                    padding: "0.2rem",
                    marginTop: "11px"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; }}
                >
                  <div style={{ position: "relative" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    {unreadCount > 0 && (
                      <span style={{
                        position: "absolute",
                        top: -4,
                        right: -1,
                        minWidth: "14px",
                        height: "14px",
                        background: "var(--critical)",
                        borderRadius: "7px",
                        border: "1px solid var(--surface)",
                        color: "white",
                        fontSize: "0.55rem",
                        fontWeight: "bold",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 3px",
                        animation: "pulse-glow 2s infinite"
                      }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                </button>

                {isNotifOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0,
                    width: "320px", background: "#fff", border: "1px solid var(--border)",
                    borderRadius: "8px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)", zIndex: 100,
                    display: "flex", flexDirection: "column"
                  }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Thông báo</h3>
                      {unreadCount > 0 && (
                        <button onClick={markAllAsRead} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "0.8rem", cursor: "pointer", fontWeight: 500 }}>
                          Đánh dấu đã đọc
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: "360px", overflowY: "auto" }}>
                      {notifications.length === 0 ? (
                        <div style={{ padding: "24px", textAlign: "center", color: "var(--foreground-muted)", fontSize: "0.9rem" }}>
                          Bạn không có thông báo nào.
                        </div>
                      ) : (
                        notifications.map(notif => (
                          <div
                            key={notif.id}
                            onClick={() => {
                              markAsRead(notif.id);
                              router.push(resolveNotificationLink(notif.link));
                              setIsNotifOpen(false);
                            }}
                            style={{
                              padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer",
                              background: notif.is_read ? "#fff" : "#eff6ff",
                              transition: "background 0.2s"
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = notif.is_read ? "var(--surface-sunken)" : "#dbeafe"}
                            onMouseLeave={e => e.currentTarget.style.background = notif.is_read ? "#fff" : "#eff6ff"}
                          >
                            <div style={{ fontSize: "0.85rem", fontWeight: notif.is_read ? 500 : 600, color: "var(--ink)", marginBottom: "4px" }}>
                              {notif.title}
                            </div>
                            <div style={{ fontSize: "0.8rem", color: "var(--foreground-muted)", lineHeight: 1.4 }}>
                              {notif.content}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--foreground-muted)", marginTop: "6px", opacity: 0.8 }}>
                              {new Date(notif.created_at + (!notif.created_at.endsWith('Z') ? 'Z' : '')).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="profile-dropdown" ref={profileMenuRef}>
                <button
                  type="button"
                  data-testid="profile-menu-toggle"
                  className="user-chip sidebar-profile-trigger"
                  aria-haspopup="menu"
                  aria-expanded={isProfileMenuOpen}
                  onClick={() => setIsProfileMenuOpen((current) => !current)}
                  style={{ background: "transparent", display: "flex", alignItems: "center", padding: "0.2rem", borderRadius: "50%", border: "none", cursor: "pointer", transition: "transform 0.2s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "none" }}
                >
                  <UserAvatar
                    userId={activeShellData.currentUser.id}
                    email={activeShellData.currentUser.email}
                    name={activeShellData.currentUser.name}
                    avatarUrl={activeShellData.currentUser.avatarUrl}
                    size={42}
                  />
                </button>

                {isProfileMenuOpen ? (
                  <div className="profile-menu" role="menu" aria-label="Profile actions" style={{ right: 0, minWidth: "260px" }}>
                    <div style={{ padding: "0.35rem 0.95rem 0.85rem 0.95rem", borderBottom: "1px solid rgba(0,0,0,0.06)", marginBottom: "0.35rem" }}>
                      <strong style={{ display: "block", color: "var(--ink)", fontSize: "0.95rem" }}>{activeShellData.currentUser.name}</strong>
                      <span style={{ display: "block", color: "var(--foreground-muted)", fontSize: "0.8rem", marginTop: "4px" }}>{sidebarUserTitle}</span>
                    </div>

                    <button
                      type="button"
                      className="profile-menu-item profile-menu-button"
                      role="menuitem"
                      onClick={handleOpenProfile}
                    >
                      <span className="profile-menu-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-6 1.8-6 4v1h12v-1c0-2.2-2.7-4-6-4Z" />
                        </svg>
                      </span>
                      <span className="profile-menu-copy">
                        <strong>Profile</strong>
                        <small>Xem thông tin cá nhân</small>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="profile-menu-item profile-menu-button"
                      role="menuitem"
                      onClick={handleOpenPasswordModal}
                    >
                      <span className="profile-menu-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path d="M17 9V7a5 5 0 0 0-10 0v2H5v11h14V9Zm-8 0V7a3 3 0 0 1 6 0v2Zm2 4h2v4h-2Z" />
                        </svg>
                      </span>
                      <span className="profile-menu-copy">
                        <strong>Đổi mật khẩu</strong>
                        <small>Cập nhật thông tin bảo mật</small>
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="logout-button"
                      className="profile-menu-item profile-menu-button"
                      role="menuitem"
                      onClick={handleSignOut}
                    >
                      <span className="profile-menu-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path d="M10 17v-2h4V9h-4V7h7v10Zm-1-3-3-3 3-3v2h5v2H9Z" />
                          <path d="M4 5h7v2H6v10h5v2H4Z" />
                        </svg>
                      </span>
                      <span className="profile-menu-copy">
                        <strong>Đăng xuất</strong>
                        <small>Thoát khỏi phiên hiện tại</small>
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>
        <div className="page-stack">{children}</div>
      </main>

      {isPasswordModalOpen ? (
        <ChangePasswordModal session={session} onClose={() => setIsPasswordModalOpen(false)} />
      ) : null}
    </div>
  );
}
