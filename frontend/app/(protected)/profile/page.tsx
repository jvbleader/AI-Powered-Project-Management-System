"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { Surface } from "@/components/ui";
import { removeUserAvatar, storeUserAvatar } from "@/lib/utils/avatar";
import { updateSessionCurrentUser } from "@/lib/auth/session";
import { workspaceApi } from "@/lib/api";
import { presenceLabel, roleLabel } from "@/lib/utils/format";
import { normalizeViewer } from "@/lib/mock/permissions";
import { useAuthSession } from "@/lib/auth/use-session";
import type { WorkspaceShellData } from "@/types/dto";

import styles from "./styles/profile.module.css";

export default function ProfilePage() {
  const session = useAuthSession();
  const viewer = normalizeViewer(session?.currentUser);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [shellData, setShellData] = useState<WorkspaceShellData>({
    currentUser: viewer,
    activeProjects: 0,
    openTasks: 0,
    missingLogwork: 0,
    alertCount: 0,
  });
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadShellData() {
      const { data } = await workspaceApi.getShellData(viewer);

      if (!isCancelled) {
        setShellData(data);
      }
    }

    void loadShellData();

    return () => {
      isCancelled = true;
    };
  }, [viewer]);

  const activeUser = session?.currentUser ?? viewer;

  const infoItems = [
    { label: "Họ tên", value: activeUser.name },
    { label: "Email", value: activeUser.email },
    { label: "Vai trò", value: roleLabel(activeUser.role) },
    { label: "Chức danh", value: activeUser.title },
    { label: "Trạng thái", value: presenceLabel(activeUser.presence) },
    { label: "Mã định danh", value: activeUser.id },
  ];

  const handleSelectAvatar = () => {
    setAvatarError(null);
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setAvatarError("Vui lòng chọn một tệp ảnh hợp lệ.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const nextAvatarUrl = typeof reader.result === "string" ? reader.result : null;

      if (!nextAvatarUrl) {
        setAvatarError("Không thể đọc ảnh đã chọn.");
        return;
      }

      storeUserAvatar(activeUser.id, nextAvatarUrl);
      updateSessionCurrentUser({
        ...activeUser,
        avatarUrl: nextAvatarUrl,
      });
      setAvatarError(null);
      event.target.value = "";
    };

    reader.onerror = () => {
      setAvatarError("Đã xảy ra lỗi khi tải ảnh lên.");
      event.target.value = "";
    };

    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    removeUserAvatar(activeUser.id);
    updateSessionCurrentUser({
      ...activeUser,
      avatarUrl: undefined,
    });
    setAvatarError(null);
  };

  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Hồ sơ cá nhân"
      subheading="Thông tin tài khoản cơ bản của người dùng đang đăng nhập."
      highlightLabel="Account"
      highlightValue="Thông tin tài khoản"
    >
      <Surface title="Thông tin tài khoản" kicker="ACCOUNT" className={styles.accountSurface}>
        <section className={styles.accountHeader}>
          <div className={styles.avatarPanel}>
            <div className={styles.avatarLarge}>
              {activeUser.avatarUrl ? (
                <Image
                  src={activeUser.avatarUrl}
                  alt={activeUser.name}
                  className="avatar-image"
                  width={72}
                  height={72}
                  unoptimized
                />
              ) : (
                activeUser.initials
              )}
            </div>

            <div className={styles.avatarActions}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className={styles.hiddenFileInput}
              />
              <button type="button" className="secondary-button" onClick={handleSelectAvatar}>
                Đổi avatar
              </button>
              {activeUser.avatarUrl ? (
                <button type="button" className="text-button" onClick={handleRemoveAvatar}>
                  Xóa avatar
                </button>
              ) : null}
              {avatarError ? <p className="form-error">{avatarError}</p> : null}
            </div>
          </div>
        </section>

        <section className={styles.infoGrid}>
          {infoItems.map((item) => (
            <article key={item.label} className={styles.infoCard}>
              <span className={styles.infoLabel}>{item.label}</span>
              <strong className={styles.infoValue}>{item.value}</strong>
            </article>
          ))}
        </section>
      </Surface>
    </WorkspaceShell>
  );
}
