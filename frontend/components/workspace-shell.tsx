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
  highlightLabel,
  highlightValue,
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
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [canViewTeamNavigation, setCanViewTeamNavigation] = useState(
    canAccessTeamDirectoryRole(shellData.currentUser.role, shellData.currentUser.department),
  );
  const [canViewLogworkApprovals, setCanViewLogworkApprovals] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

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
        }
      } catch {
        if (!isCancelled) {
          setCanViewTeamNavigation(isGlobalTeamViewer);
          setCanViewLogworkApprovals(false);
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

  const handleSignOut = async () => {
    setIsProfileMenuOpen(false);
    await signOut();
    router.push("/login");
  };

  const handleSignOutAll = async () => {
    setIsProfileMenuOpen(false);
    await signOutAll();
    router.push("/login");
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
                  activeShellData.currentUser.initials
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

                <button
                  type="button"
                  className="profile-menu-item profile-menu-button"
                  role="menuitem"
                  onClick={handleSignOutAll}
                  style={{ color: "var(--danger-foreground)" }}
                >
                  <span className="profile-menu-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </span>
                  <span className="profile-menu-copy">
                    <strong>Đăng xuất tất cả</strong>
                    <small>Thoát khỏi tất cả các thiết bị</small>
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
            <div className="quick-chip">
              <span>{highlightLabel}</span>
              <strong>{highlightValue}</strong>
            </div>
          </div>
        </header>
        <div className="page-stack">{children}</div>
      </main>

      <AssistantBubble alertCount={activeShellData.alertCount} projectId={assistantProjectId} />

      {isPasswordModalOpen ? (
        <ChangePasswordModal session={session} onClose={() => setIsPasswordModalOpen(false)} />
      ) : null}
    </div>
  );
}
