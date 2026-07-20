"use client";

import Image from "next/image";
import { useRef, useState, type ChangeEvent } from "react";
import { StatusPill } from "@/components/ui";
import { hasCompanywideProjectAccess, isAdminRole, isLeaderRole, isManagerRole, roleLabel } from "@/lib/utils/format";
import { userApi } from "@/services/api";
import { storeUserAvatar } from "@/lib/utils/avatar";
import type { UserProfile } from "@/types";
import styles from "../styles/profile.module.css";

interface ProfileHeroProps {
  user: UserProfile;
  onUpdate: (updatedUser: UserProfile) => void;
}

export function ProfileHero({ user, onUpdate }: ProfileHeroProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);
  const roleTone = isAdminRole(user.role)
    ? "critical"
    : hasCompanywideProjectAccess(user.role, user.department)
      ? "on-track"
      : isManagerRole(user.role) || isLeaderRole(user.role)
        ? "accent"
        : "neutral";

  function handleSelectAvatar() {
    setAvatarNotice(null);
    fileInputRef.current?.click();
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setAvatarNotice("Vui lòng chọn một tệp ảnh hợp lệ.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      const nextAvatarUrl = typeof reader.result === "string" ? reader.result : null;

      if (!nextAvatarUrl) {
        setAvatarNotice("Không thể đọc ảnh đã chọn.");
        return;
      }

      try {
        storeUserAvatar(user.id, nextAvatarUrl);
        const { data: updatedProfile } = await userApi.updateCurrentAvatar(user, nextAvatarUrl);
        onUpdate(updatedProfile);
        setAvatarNotice("Đã cập nhật ảnh đại diện.");
      } catch (error) {
        setAvatarNotice(
          error instanceof Error ? error.message : "Không thể cập nhật ảnh đại diện.",
        );
      } finally {
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      setAvatarNotice("Đã xảy ra lỗi khi tải ảnh lên.");
      event.target.value = "";
    };

    reader.readAsDataURL(file);
  }

  return (
    <div className={styles.heroColumn}>
      <div className={styles.heroAvatarWrapper}>
        <div className={styles.heroAvatar}>
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={user.name}
              className="avatar-image"
              width={104}
              height={104}
              unoptimized
            />
          ) : (
            user.initials
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className={styles.hiddenFileInput}
        />
        <button
          type="button"
          className={styles.avatarEditOverlay}
          onClick={handleSelectAvatar}
          title="Đổi ảnh đại diện"
        >
          <svg viewBox="0 0 24 24">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
      </div>

      <div className={styles.heroInfo}>
        <h1 className={styles.heroName}>{user.name}</h1>
        <span className={styles.heroEmail}>{user.email}</span>
        <div className={styles.heroBadges}>
          <StatusPill
            label={roleLabel(user.role)}
            tone={roleTone}
          />
          <StatusPill
            label={user.isActive ? "Hoạt động" : "Tạm dừng"}
            tone={user.isActive ? "on-track" : "watch"}
          />
        </div>
        {avatarNotice ? <p className={styles.avatarNotice}>{avatarNotice}</p> : null}
      </div>
    </div>
  );
}
