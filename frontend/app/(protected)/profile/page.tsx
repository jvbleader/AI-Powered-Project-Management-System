"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { Surface, StatusPill } from "@/components/ui";
import { updateSessionCurrentUser } from "@/lib/auth/session";
import { workspaceApi, userApi } from "@/lib/api";
import { normalizeViewer } from "@/lib/mock/permissions";
import { removeUserAvatar, storeUserAvatar } from "@/lib/utils/avatar";
import { presenceLabel, roleLabel, userStatusLabel } from "@/lib/utils/format";
import { useAuthSession } from "@/lib/auth/use-session";
import type { UpdateProfilePayload, UserProfile, WorkspaceShellData } from "@/types/dto";

import styles from "./styles/profile.module.css";

type ProfileFormState = UpdateProfilePayload;

function toFormState(user: UserProfile): ProfileFormState {
  return {
    name: user.name,
    phoneNumber: user.phoneNumber ?? "",
    department: user.department ?? "",
    jobTitle: user.jobTitle ?? user.title ?? "",
    address: user.address ?? "",
  };
}

export default function ProfilePage() {
  const session = useAuthSession();
  const viewer = useMemo(() => normalizeViewer(session?.currentUser), [session?.currentUser]);
  const currentActor = useMemo(() => session?.currentUser ?? viewer, [session?.currentUser, viewer]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [shellData, setShellData] = useState<WorkspaceShellData>({
    currentUser: viewer,
    activeProjects: 0,
    openTasks: 0,
    missingLogwork: 0,
    alertCount: 0,
  });
  const [profile, setProfile] = useState<UserProfile>(viewer);
  const [form, setForm] = useState<ProfileFormState>(toFormState(viewer));
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadPageData() {
      try {
        const [{ data: nextShellData }, { data: nextProfile }] = await Promise.all([
          workspaceApi.getShellData(currentActor),
          userApi.getCurrentProfile(currentActor),
        ]);

        if (isCancelled) {
          return;
        }

        setShellData(nextShellData);
        setProfile(nextProfile);
        setForm(toFormState(nextProfile));
      } finally {
        if (!isCancelled) {
          setIsLoadingProfile(false);
        }
      }
    }

    void loadPageData();

    return () => {
      isCancelled = true;
    };
  }, [currentActor]);

  const activeUser = profile;
  const isDirty =
    form.name !== activeUser.name ||
    form.phoneNumber !== (activeUser.phoneNumber ?? "") ||
    form.department !== (activeUser.department ?? "") ||
    form.jobTitle !== (activeUser.jobTitle ?? activeUser.title ?? "") ||
    form.address !== (activeUser.address ?? "");

  const infoItems = [
    { label: "Mã định danh", value: activeUser.employeeCode ?? activeUser.id },
    { label: "Vai trò chính", value: roleLabel(activeUser.role) },
    { label: "Trạng thái hệ thống", value: userStatusLabel(activeUser.status ?? "ACTIVE") },
    { label: "Hiện diện", value: presenceLabel(activeUser.presence) },
    { label: "Phòng ban", value: activeUser.department || "Chưa cập nhật" },
    { label: "Cập nhật gần nhất", value: activeUser.lastUpdatedAt ? new Date(activeUser.lastUpdatedAt).toLocaleString("vi-VN") : "Chưa có" },
  ];

  async function syncCurrentUser(nextUser: UserProfile) {
    setProfile(nextUser);
    setForm(toFormState(nextUser));
    updateSessionCurrentUser({
      ...currentActor,
      ...nextUser,
    });
    const { data: nextShellData } = await workspaceApi.getShellData(nextUser);
    setShellData(nextShellData);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormNotice(null);

    if (!form.name.trim()) {
      setFormError("Họ tên không được để trống.");
      return;
    }

    setIsSaving(true);

    try {
      const { data: updatedProfile } = await userApi.updateCurrentProfile(currentActor, {
        name: form.name.trim(),
        phoneNumber: form.phoneNumber.trim(),
        department: form.department.trim(),
        jobTitle: form.jobTitle.trim(),
        address: form.address.trim(),
      });

      await syncCurrentUser(updatedProfile);
      setFormNotice("Đã lưu hồ sơ ở chế độ preview frontend.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể lưu hồ sơ lúc này.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleSelectAvatar() {
    setAvatarError(null);
    setFormNotice(null);
    fileInputRef.current?.click();
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
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

    reader.onload = async () => {
      const nextAvatarUrl = typeof reader.result === "string" ? reader.result : null;

      if (!nextAvatarUrl) {
        setAvatarError("Không thể đọc ảnh đã chọn.");
        return;
      }

      try {
        storeUserAvatar(activeUser.id, nextAvatarUrl);
        const { data: updatedProfile } = await userApi.updateCurrentAvatar(activeUser, nextAvatarUrl);
        await syncCurrentUser(updatedProfile);
        setAvatarError(null);
        setFormNotice("Đã cập nhật ảnh đại diện ở chế độ preview frontend.");
      } catch (error) {
        setAvatarError(error instanceof Error ? error.message : "Không thể cập nhật ảnh đại diện.");
      } finally {
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      setAvatarError("Đã xảy ra lỗi khi tải ảnh lên.");
      event.target.value = "";
    };

    reader.readAsDataURL(file);
  }

  async function handleRemoveAvatar() {
    try {
      removeUserAvatar(activeUser.id);
      const { data: updatedProfile } = await userApi.updateCurrentAvatar(activeUser, undefined);
      await syncCurrentUser(updatedProfile);
      setAvatarError(null);
      setFormNotice("Đã xóa ảnh đại diện ở chế độ preview frontend.");
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : "Không thể xóa ảnh đại diện.");
    }
  }

  return (
    <WorkspaceShell
      shellData={shellData}
      heading="Hồ sơ cá nhân"
      subheading="Người dùng có thể xem, cập nhật thông tin liên lạc và thay đổi ảnh đại diện ngay trên một màn hình thống nhất."
      highlightLabel="Profile"
      highlightValue={activeUser.employeeCode ?? "PERSONAL"}
    >
      <div className={styles.pageStack}>
        <div className={styles.previewBanner}>
          <div>
            <span className="kicker">Frontend Preview</span>
            <h2>Luồng chỉnh sửa hồ sơ đã sẵn sàng để trình duyệt</h2>
            <p>Email đăng nhập vẫn đang lấy từ backend hiện tại. Các trường liên lạc và avatar đang được lưu cục bộ để bạn duyệt trước.</p>
          </div>
          <StatusPill label={userStatusLabel(activeUser.status ?? "ACTIVE")} tone={activeUser.status === "ACTIVE" ? "on-track" : "watch"} />
        </div>

        <div className={styles.layout}>
          <Surface title="Danh thiếp tài khoản" kicker="Identity" className={styles.identitySurface}>
            <section className={styles.identityPanel}>
              <div className={styles.avatarSection}>
                <div className={styles.avatarLarge}>
                  {activeUser.avatarUrl ? (
                    <Image
                      src={activeUser.avatarUrl}
                      alt={activeUser.name}
                      className="avatar-image"
                      width={92}
                      height={92}
                      unoptimized
                    />
                  ) : (
                    activeUser.initials
                  )}
                </div>

                <div className={styles.avatarActions}>
                  <strong>{activeUser.name}</strong>
                  <p>{activeUser.jobTitle ?? activeUser.title}</p>
                  <div className={styles.avatarButtons}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className={styles.hiddenFileInput}
                    />
                    <button type="button" className="primary-button" onClick={handleSelectAvatar}>
                      Đổi ảnh đại diện
                    </button>
                    {activeUser.avatarUrl ? (
                      <button type="button" className="secondary-button" onClick={handleRemoveAvatar}>
                        Xóa ảnh
                      </button>
                    ) : null}
                  </div>
                  {avatarError ? <p className="form-error">{avatarError}</p> : null}
                </div>
              </div>

              <div className={styles.badgeRow}>
                <StatusPill label={roleLabel(activeUser.role)} tone={activeUser.role === "ADMIN" ? "critical" : "accent"} />
                <StatusPill label={presenceLabel(activeUser.presence)} tone={activeUser.presence === "focus" ? "watch" : activeUser.presence === "online" ? "on-track" : "neutral"} />
              </div>

              <div className={styles.infoGrid}>
                {infoItems.map((item) => (
                  <article key={item.label} className={styles.infoCard}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>
            </section>
          </Surface>

          <Surface title="Thông tin liên lạc" kicker="Editable Profile" className={styles.formSurface}>
            <form className={styles.profileForm} onSubmit={handleSubmit}>
              <div className={styles.formGrid}>
                <label>
                  <span>Họ và tên</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Nguyễn Văn An"
                    required
                  />
                </label>

                <label>
                  <span>Email đăng nhập</span>
                  <input value={activeUser.email} disabled readOnly />
                  <small>Email đang bám theo tài khoản backend hiện tại.</small>
                </label>

                <label>
                  <span>Số điện thoại</span>
                  <input
                    value={form.phoneNumber}
                    onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                    placeholder="0901 234 567"
                  />
                </label>

                <label>
                  <span>Phòng ban</span>
                  <input
                    value={form.department}
                    onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
                    placeholder="Project Delivery"
                  />
                </label>

                <label>
                  <span>Chức danh hiển thị</span>
                  <input
                    value={form.jobTitle}
                    onChange={(event) => setForm((current) => ({ ...current, jobTitle: event.target.value }))}
                    placeholder="Project Manager"
                  />
                </label>

                <label className={styles.fullWidth}>
                  <span>Địa chỉ liên hệ</span>
                  <textarea
                    value={form.address}
                    onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                    placeholder="Tòa nhà, quận, thành phố"
                    rows={4}
                  />
                </label>
              </div>

              <div className={styles.formFooter}>
                <div>
                  {isLoadingProfile ? <p>Đang tải hồ sơ...</p> : <p>Các thay đổi hiện được lưu trong frontend để bạn duyệt luồng trước khi nối backend.</p>}
                  {formError ? <p className="form-error">{formError}</p> : null}
                  {formNotice ? <p className="form-success">{formNotice}</p> : null}
                </div>

                <button type="submit" className="primary-button" disabled={isSaving || !isDirty}>
                  {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </Surface>
        </div>
      </div>
    </WorkspaceShell>
  );
}
