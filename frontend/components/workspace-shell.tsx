"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { signOut } from "@/services/auth/session";
import { authApi } from "@/services/api";
import { AssistantBubble } from "@/components/assistant-bubble";
import { PasswordField } from "@/components/password-field";
import { useAuthSession } from "@/hooks/use-session";
import type { WorkspaceShellData } from "@/types";

const navigation = [
  { href: "/dashboard", label: "Tổng quan", icon: "grid" },
  { href: "/projects", label: "Dự án", icon: "layers" },
  { href: "/tasks", label: "Nhiệm vụ", icon: "kanban" },
  { href: "/team", label: "Nhân sự", icon: "users" },
];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function NavIcon({ icon }: { icon: string }) {
  if (icon === "layers") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4 4 8l8 4 8-4-8-4Z" />
        <path d="m4 12 8 4 8-4" />
        <path d="m4 16 8 4 8-4" />
      </svg>
    );
  }

  if (icon === "bolt") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 2 5 14h5l-1 8 8-12h-5l1-8Z" />
      </svg>
    );
  }

  if (icon === "kanban") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h4v10H5zM10 4h4v6h-4zM15 4h4v14h-4z" />
      </svg>
    );
  }

  if (icon === "clock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 10.4 3.1 1.8-.8 1.4L11 13V7h2Z" />
      </svg>
    );
  }

  if (icon === "users") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-6 1.8-6 4v2h12v-2c0-2.2-2.7-4-6-4Zm8-2a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-1.1 0-2.2.3-3.1.8 1.3 1 2.1 2.3 2.1 3.8v1.4H22V18c0-2-2.2-5-5-5Z" />
      </svg>
    );
  }

  if (icon === "spark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2 2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
  );
}

export function WorkspaceShell({
  shellData,
  heading,
  subheading,
  highlightLabel,
  highlightValue,
  children,
}: {
  shellData: WorkspaceShellData;
  heading: string;
  subheading: string;
  highlightLabel: string;
  highlightValue: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAuthSession();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isCurrentPasswordVisible, setIsCurrentPasswordVisible] = useState(false);
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const activeShellData = session
    ? {
        ...shellData,
        currentUser: session.currentUser,
      }
    : shellData;

  const filteredNavigation = navigation.filter((item) => {
    if (item.href !== "/team") {
      return true;
    }

    return activeShellData.currentUser.role !== "MEMBER";
  });

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

  const handleSignOut = async () => {
    setIsProfileMenuOpen(false);
    await signOut();
    router.push("/login");
  };

  const resetPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setIsCurrentPasswordVisible(false);
    setIsNewPasswordVisible(false);
    setIsConfirmPasswordVisible(false);
    setPasswordError(null);
  };

  const handleOpenPasswordModal = () => {
    setIsProfileMenuOpen(false);
    resetPasswordForm();
    setIsPasswordModalOpen(true);
  };

  const handleClosePasswordModal = () => {
    if (isChangingPassword) {
      return;
    }

    setIsPasswordModalOpen(false);
    resetPasswordForm();
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);

    if (!session) {
      setPasswordError("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      return;
    }

    const hasLetter = Array.from(newPassword).some(
      (character) => character.toLocaleLowerCase() !== character.toLocaleUpperCase(),
    );
    const hasNumber = Array.from(newPassword).some((character) => /\d/u.test(character));

    if (!hasLetter || !hasNumber) {
      setPasswordError("Mật khẩu phải chứa chữ cái và chữ số.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu xác nhận chưa khớp.");
      return;
    }

    setIsChangingPassword(true);

    try {
      await authApi.changePassword(session, {
        currentPassword,
        newPassword,
      });

      await signOut();
      router.push("/login");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Không thể đổi mật khẩu lúc này.");
    } finally {
      setIsChangingPassword(false);
    }
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
                <p>{activeShellData.currentUser.title}</p>
              </div>
              <span className="profile-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>

            {isProfileMenuOpen ? (
              <div className="profile-menu" role="menu" aria-label="Profile actions">
                <button type="button" className="profile-menu-item profile-menu-button" role="menuitem" onClick={handleOpenProfile}>
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

                <button type="button" className="profile-menu-item profile-menu-button" role="menuitem" onClick={handleOpenPasswordModal}>
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

                <button type="button" className="profile-menu-item profile-menu-button" role="menuitem" onClick={handleSignOut}>
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
            <span className="eyebrow">Trung tâm điều hành</span>
            <h1>{heading}</h1>
            <p>{subheading}</p>
          </div>
          <div className="topbar-actions">
            <div className="quick-chip">
              <span>{highlightLabel}</span>
              <strong>{highlightValue}</strong>
            </div>
          </div>
        </header>
        <div className="page-stack">{children}</div>
      </main>

      <AssistantBubble alertCount={activeShellData.alertCount} />

      {isPasswordModalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={handleClosePasswordModal}>
          <section
            className="password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="password-modal-header">
              <div>
                <span className="eyebrow">Bảo mật</span>
                <h2 id="change-password-title">Đổi mật khẩu</h2>
              </div>
              <button type="button" className="icon-button" onClick={handleClosePasswordModal} aria-label="Đóng">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <form className="password-form" onSubmit={handleChangePassword}>
              <label>
                <span>Mật khẩu hiện tại</span>
                <PasswordField
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  isVisible={isCurrentPasswordVisible}
                  onToggleVisibility={() => setIsCurrentPasswordVisible((current) => !current)}
                  autoComplete="current-password"
                />
              </label>

              <label>
                <span>Mật khẩu mới</span>
                <PasswordField
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  isVisible={isNewPasswordVisible}
                  onToggleVisibility={() => setIsNewPasswordVisible((current) => !current)}
                  autoComplete="new-password"
                />
              </label>

              <label>
                <span>Nhập lại mật khẩu mới</span>
                <PasswordField
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  isVisible={isConfirmPasswordVisible}
                  onToggleVisibility={() => setIsConfirmPasswordVisible((current) => !current)}
                  autoComplete="new-password"
                />
              </label>

              {passwordError ? <p className="form-error">{passwordError}</p> : null}

              <div className="password-modal-actions">
                <button type="button" className="secondary-button" onClick={handleClosePasswordModal} disabled={isChangingPassword}>
                  Hủy
                </button>
                <button type="submit" className="primary-button" disabled={isChangingPassword}>
                  {isChangingPassword ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
