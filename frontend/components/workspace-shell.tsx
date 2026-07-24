"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { signOut, signOutAll } from "@/services/auth/session";
import { projectApi } from "@/services/api/projects";
import { primeTasksPageData } from "@/services/page-cache/tasks-page";
import { AssistantBubble } from "@/components/assistant-bubble";
import { useAuthSession } from "@/hooks/use-session";
import { NavIcon } from "@/components/nav-icon";
import { ChangePasswordModal } from "@/components/change-password-modal";
import { SignOutModal } from "@/components/sign-out-modal";
import { useNotifications } from "@/contexts/notification-context";
import {
  canAccessTeamDirectoryRole,
  isAdminRole,
  roleLabel,
} from "@/lib/utils/format";
import type { UserRole, WorkspaceShellData } from "@/types";

const navigation = [
  { href: "/dashboard", label: "Tổng quan", icon: "grid" },
  { href: "/projects", label: "Dự án", icon: "layers" },
  { href: "/tasks", label: "Nhiệm vụ", icon: "kanban" },
  { href: "/logwork-approvals", label: "Duyệt log work", icon: "check-circle" },
  { href: "/team", label: "Nhân sự", icon: "users" },
];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function WorkspaceShell({
  shellData,
  heading,
  subheading,
  highlightLabel,
  highlightValue = "",
  headerAction,
  assistantProjectId,
  children,
}: {
  shellData: WorkspaceShellData;
  heading: string;
  subheading: string;
  highlightLabel: string;
  highlightValue: string;
  headerAction?: ReactNode;
  assistantProjectId?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAuthSession();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [canViewTeamNavigation, setCanViewTeamNavigation] = useState(() => {
    const isGlobal = canAccessTeamDirectoryRole(shellData.currentUser.role, shellData.currentUser.department);
    if (typeof window !== "undefined") {
      const cached = sessionStorage.getItem("canViewTeamNavigation");
      if (cached !== null) return cached === "true";
    }
    return isGlobal;
  });
  const [canViewLogworkApprovals, setCanViewLogworkApprovals] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("canViewLogworkApprovals") === "true";
    }
    return false;
  });
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
  const currentUser = activeShellData.currentUser;
  const currentUserId = activeShellData.currentUser.id;
  const isAdminViewer = isAdminRole(currentUser.role);
  const sidebarUserTitle = currentUser.department
    ? `${roleLabel(currentUser.role)} - ${currentUser.department}`
    : roleLabel(currentUser.role) || currentUser.title;

  const filteredNavigation = navigation.filter((item) => {
    if (isAdminViewer) {
      if (item.href === "/logwork-approvals") return false;
      return item.href === "/team";
    }

    if (item.href === "/logwork-approvals") {
      return canViewLogworkApprovals;
    }

    return item.href !== "/team" || canViewTeamNavigation;
  });

  useEffect(() => {
    let isCancelled = false;

    async function resolveTeamNavigationAccess() {
      const isGlobalTeamViewer = canAccessTeamDirectoryRole(currentUser.role, currentUser.department);
      
      try {
        const { data: projects } = await projectApi.list(undefined, currentUser);
        if (!isCancelled) {
          const isManagerOfAny = projects.some((project) => project.managerId === currentUser.id);
          const isLeaderOfAny = projects.some(
            (project) => (project as any).members?.some((m: any) => m.userId === currentUser.id && m.role === "LEADER")
          );
          setCanViewTeamNavigation(isGlobalTeamViewer || isManagerOfAny);
          setCanViewLogworkApprovals(isManagerOfAny || isLeaderOfAny);
          sessionStorage.setItem("canViewTeamNavigation", String(isGlobalTeamViewer || isManagerOfAny));
          sessionStorage.setItem("canViewLogworkApprovals", String(isManagerOfAny || isLeaderOfAny));
        }
      } catch {
        if (!isCancelled) {
          setCanViewTeamNavigation(isGlobalTeamViewer);
          setCanViewLogworkApprovals(false);
          sessionStorage.setItem("canViewTeamNavigation", String(isGlobalTeamViewer));
          sessionStorage.setItem("canViewLogworkApprovals", "false");
        }
      }
    }

    void resolveTeamNavigationAccess();

    return () => {
      isCancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (
      isAdminViewer &&
      pathname &&
      !pathname.startsWith("/team") &&
      !pathname.startsWith("/profile")
    ) {
      router.replace("/team");
    }
  }, [isAdminViewer, pathname, router]);

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

  const handleSignOut = () => {
    setIsProfileMenuOpen(false);
    setIsSignOutModalOpen(true);
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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-profile-panel">
          <div className="profile-dropdown" ref={profileMenuRef}>
            <button
              type="button"
              className="user-chip sidebar-user-chip sidebar-profile-trigger"
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
              onClick={() => setIsProfileMenuOpen((current) => !current)}
            >
              <span className="avatar-token">
                {activeShellData.currentUser.avatarUrl ? (
                  <Image
                    src={activeShellData.currentUser.avatarUrl}
                    alt={activeShellData.currentUser.name}
                    className="avatar-image"
                    width={46}
                    height={46}
                    unoptimized
                  />
                ) : (
                  activeShellData.currentUser.avatarUrl ? (
                    <img src={activeShellData.currentUser.avatarUrl} alt={activeShellData.currentUser.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    activeShellData.currentUser.initials
                  )
                )}
              </span>
              <div className="sidebar-profile-copy">
                <strong>{activeShellData.currentUser.name}</strong>
                <p>{sidebarUserTitle}</p>
              </div>
              <span className="profile-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>

            {isProfileMenuOpen ? (
              <div className="profile-menu" role="menu" aria-label="Profile actions">
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

        <nav className="sidebar-nav" aria-label="Primary">
          {filteredNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={classNames("nav-link", pathname === item.href && "nav-link-active")}
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

      <main className="workspace-main">
        <header className="topbar">
          <div>
            <h1>{heading}</h1>
            {/* <p>{subheading}</p> */}
          </div>
          <div className="topbar-actions">
            {headerAction}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div ref={notifRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  title="Thông báo"
                  onClick={() => setIsNotifOpen(!isNotifOpen)}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "50%",
                    width: "48px",
                    height: "48px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: "var(--ink)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)" }}
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
                              router.push(notif.link);
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
            </div>
          </div>
        </header>
        <div className="page-stack">{children}</div>
      </main>

      <AssistantBubble alertCount={activeShellData.alertCount} projectId={assistantProjectId} />

      {isPasswordModalOpen ? (
        <ChangePasswordModal session={session} onClose={() => setIsPasswordModalOpen(false)} />
      ) : null}

      {isSignOutModalOpen ? (
        <SignOutModal onClose={() => setIsSignOutModalOpen(false)} />
      ) : null}
    </div>
  );
}
