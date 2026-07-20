"use client";

import { useState } from "react";
import { roleLabel } from "@/lib/utils/format";
import { userApi } from "@/services/api";
import type { UserProfile } from "@/types";
import styles from "../styles/profile.module.css";

interface PersonalInfoProps {
  user: UserProfile;
  onUpdate: (updatedUser: UserProfile) => void;
}

export function PersonalInfo({ user, onUpdate }: PersonalInfoProps) {
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  function handleStartEditPhone() {
    setPhoneInput(user.phoneNumber ?? "");
    setPhoneError(null);
    setIsEditingPhone(true);
  }

  function handleCancelEditPhone() {
    setIsEditingPhone(false);
    setPhoneError(null);
  }

  async function handleSavePhone() {
    const trimmed = phoneInput.trim();

    if (trimmed) {
      const phoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$/;
      if (!phoneRegex.test(trimmed)) {
        setPhoneError("Số điện thoại không hợp lệ");
        return;
      }
    }

    setIsSavingPhone(true);
    setPhoneError(null);

    try {
      const { data: updatedProfile } = await userApi.updatePhone(trimmed);
      onUpdate(updatedProfile);
      setIsEditingPhone(false);
    } catch (error) {
      setPhoneError(error instanceof Error ? error.message : "Không thể cập nhật số điện thoại.");
    } finally {
      setIsSavingPhone(false);
    }
  }

  const createdAtFormatted = user.lastUpdatedAt
    ? new Date(user.lastUpdatedAt).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "Chưa có dữ liệu";

  const infoItems = [
    {
      label: "Họ và tên",
      value: user.name,
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      tone: "",
    },
    {
      label: "Email đăng nhập",
      value: user.email,
      icon: (
        <svg viewBox="0 0 24 24">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      ),
      tone: "",
    },
    {
      label: "Vai trò",
      value: roleLabel(user.role),
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      tone: "amberTone",
    },
    {
      label: "Phòng ban",
      value: user.department || "Chưa cập nhật",
      icon: (
        <svg viewBox="0 0 24 24">
          <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      ),
      tone: "blueTone",
    },
    {
      label: "Trạng thái",
      value: user.isActive ? "Đang hoạt động" : "Bị tạm dừng",
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
      tone: "greenTone",
    },
    {
      label: "Mã định danh",
      value: user.employeeCode ?? user.id,
      icon: (
        <svg viewBox="0 0 24 24">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 7h10M7 12h10M7 17h6" />
        </svg>
      ),
      tone: "tealTone",
    },
  ];

  return (
    <div className={styles.detailSection}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          <h3>Thông tin cá nhân</h3>
        </div>
      </div>

      <div className={styles.infoList}>
        {infoItems.map((item) => (
          <div key={item.label} className={styles.infoItem}>
            <div className={`${styles.infoIcon} ${item.tone ? styles[item.tone] : ""}`}>
              {item.icon}
            </div>
            <dl className={styles.infoContent}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </dl>
          </div>
        ))}

        <div className={styles.infoItem}>
          <div className={`${styles.infoIcon} ${styles.greenTone}`}>
            <svg viewBox="0 0 24 24">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <dl className={styles.infoContent}>
            <dt>Số điện thoại</dt>
            <dd>
              {isEditingPhone ? (
                <div className={styles.phoneEditInline}>
                  <input
                    value={phoneInput}
                    onChange={(event) => setPhoneInput(event.target.value)}
                    placeholder="Nhập số điện thoại"
                    autoFocus
                  />
                  <div className={styles.phoneEditActions}>
                    <button
                      type="button"
                      className={styles.saveButton}
                      onClick={handleSavePhone}
                      disabled={isSavingPhone}
                    >
                      {isSavingPhone ? "Đang lưu..." : "Lưu"}
                    </button>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={handleCancelEditPhone}
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.phoneDisplayInline}>
                  {user.phoneNumber ? (
                    <span className={styles.phoneValue}>{user.phoneNumber}</span>
                  ) : (
                    <span className={styles.phoneEmpty}>Chưa cập nhật</span>
                  )}
                  <button
                    type="button"
                    className={styles.editIconOnlyButton}
                    onClick={handleStartEditPhone}
                    title="Chỉnh sửa số điện thoại"
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                  </button>
                </div>
              )}
              {phoneError ? (
                <p className={`form-error ${styles.phoneError}`}>{phoneError}</p>
              ) : null}
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
