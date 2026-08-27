"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { expandRoleDisplayLabels } from "@/lib/utils/format";
import { userApi } from "@/services/api";
import { markIntentionalLogout, signOutAll } from "@/services/auth/session";
import type { UserProfile } from "@/types";
import { AvatarCropper } from "./avatar-cropper";
import styles from "../styles/profile.module.css";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface ProfileHeroProps {
  user: UserProfile;
  onUpdate: (updatedUser: UserProfile) => void;
}

export function ProfileHero({ user, onUpdate }: ProfileHeroProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [isSigningOutAll, setIsSigningOutAll] = useState(false);

  function handleSelectAvatar() {
    setAvatarNotice(null);
    fileInputRef.current?.click();
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setAvatarNotice("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarNotice("Ảnh đại diện không được vượt quá 5 MB.");
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

      setCropImageSrc(nextAvatarUrl);
      event.target.value = "";
    };

    reader.onerror = () => {
      setAvatarNotice("Đã xảy ra lỗi khi tải ảnh lên.");
      event.target.value = "";
    };

    reader.readAsDataURL(file);
  }

  async function handleCropSave(croppedBase64: string) {
    setCropImageSrc(null);
    try {
      const { data: updatedProfile } = await userApi.updateCurrentAvatar(user, croppedBase64);
      onUpdate(updatedProfile);
      setAvatarNotice("Đã cập nhật ảnh đại diện.");
    } catch (error) {
      setAvatarNotice(
        error instanceof Error ? error.message : "Không thể cập nhật ảnh đại diện.",
      );
    }
  }

  async function handleSignOutAll() {
    if (isSigningOutAll) {
      return;
    }

    setIsSigningOutAll(true);
    try {
      markIntentionalLogout();
      await signOutAll();
      window.location.assign("/login");
    } catch {
      setIsSigningOutAll(false);
      setAvatarNotice("Không thể đăng xuất tất cả thiết bị. Vui lòng thử lại.");
    }
  }

  return (
    <div className={styles.heroColumn}>
      <div className={styles.heroAvatarWrapper}>
        <UserAvatar
          userId={user.id}
          email={user.email}
          name={user.name}
          avatarUrl={user.avatarUrl}
          size={104}
          className={styles.heroAvatar}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
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
        <div className={styles.heroBadges} aria-label="Vai trò tài khoản">
          <div className={styles.heroRoleGroup}>
            <div className={styles.heroRolePills}>
              {expandRoleDisplayLabels(user.roles?.length ? user.roles : user.role).map((rolePart) => (
                <span key={rolePart} className={styles.heroRolePill}>
                  {rolePart}
                </span>
              ))}
            </div>
          </div>
        </div>
        {avatarNotice ? <p className={styles.avatarNotice}>{avatarNotice}</p> : null}
      </div>

      <div className={styles.heroFooter}>
        <button
          type="button"
          className={styles.signOutAllButton}
          onClick={handleSignOutAll}
          disabled={isSigningOutAll}
        >
          {isSigningOutAll ? "Đang đăng xuất..." : "Đăng xuất tất cả"}
        </button>
      </div>

      {cropImageSrc && (
        <AvatarCropper
          imageSrc={cropImageSrc}
          onSave={handleCropSave}
          onCancel={() => setCropImageSrc(null)}
          onError={() => {
            setCropImageSrc(null);
            setAvatarNotice("Không thể xử lý ảnh đã chọn.");
          }}
        />
      )}
    </div>
  );
}
