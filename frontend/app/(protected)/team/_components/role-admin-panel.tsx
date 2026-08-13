"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";
import { EmptyState, Surface } from "@/components/ui";
import { formatDate, roleLabel } from "@/lib/utils/format";
import { roleApi } from "@/services/api";
import type { SystemRole } from "@/types";
import styles from "../styles/team.module.css";

interface RoleAdminPanelProps {
  onChanged?: () => void;
}

export function RoleAdminPanel({ onChanged }: RoleAdminPanelProps) {
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<SystemRole | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isAdminDraft, setIsAdminDraft] = useState(false);
  const [deleting, setDeleting] = useState<SystemRole | null>(null);

  async function loadRoles() {
    const { data } = await roleApi.list();
    setRoles(data);
  }

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        await loadRoles();
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : "Không thể tải danh sách vai trò.");
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      isCancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return roles;
    return roles.filter((role) => {
      const haystack = `${role.name} ${role.description ?? ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [roles, search]);

  const lastAdminRoleId = useMemo(() => {
    const adminRoles = roles.filter((role) => role.isAdmin);
    return adminRoles.length === 1 ? adminRoles[0].id : null;
  }, [roles]);

  function openCreate() {
    setEditing(null);
    setNameDraft("");
    setDescriptionDraft("");
    setIsAdminDraft(false);
    setError(null);
    setNotice(null);
    setIsFormOpen(true);
  }

  function openEdit(role: SystemRole) {
    setEditing(role);
    setNameDraft(role.name);
    setDescriptionDraft(role.description ?? "");
    setIsAdminDraft(role.isAdmin);
    setError(null);
    setNotice(null);
    setIsFormOpen(true);
  }

  async function handleSave() {
    if (!nameDraft.trim()) {
      setError("Vui lòng nhập tên vai trò.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (editing) {
        const { data } = await roleApi.update(editing.id, {
          name: nameDraft.trim(),
          description: descriptionDraft.trim() || null,
          isAdmin: isAdminDraft,
        });
        setRoles((current) => current.map((item) => (item.id === data.id ? data : item)));
        setNotice(`Đã cập nhật vai trò ${data.name}.`);
      } else {
        const { data } = await roleApi.create({
          name: nameDraft.trim(),
          description: descriptionDraft.trim() || null,
          isAdmin: isAdminDraft,
        });
        setRoles((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name, "vi")));
        setNotice(`Đã tạo vai trò ${data.name}.`);
      }
      setIsFormOpen(false);
      onChanged?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu vai trò.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setError(null);
    setNotice(null);
    try {
      await roleApi.remove(deleting.id);
      setRoles((current) => current.filter((item) => item.id !== deleting.id));
      setNotice(`Đã xóa vai trò ${deleting.name}.`);
      setDeleting(null);
      onChanged?.();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa vai trò.");
      setDeleting(null);
    }
  }

  return (
    <>
      {error && !isFormOpen ? <p className={`${styles.pageBanner} ${styles.pageBannerError}`}>{error}</p> : null}
      {notice && !isFormOpen ? <p className={`${styles.pageBanner} ${styles.pageBannerSuccess}`}>{notice}</p> : null}

      <Surface
        title="Danh sách vai trò"
        className={styles.tableSurface}
        aside={
          <div className={styles.toolbarActions}>
            <label className={styles.toolbarSearch}>
              <span className={styles.srOnly}>Tìm vai trò</span>
              <span className={styles.searchIcon} aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm vai trò"
              />
            </label>
            <button type="button" className={`primary-button ${styles.addUserButton}`} onClick={openCreate}>
              + Thêm vai trò
            </button>
          </div>
        }
      >
        {filtered.length ? (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.compactTable}`}>
              <thead>
                <tr>
                  <th>Tên vai trò</th>
                  <th>Mô tả</th>
                  <th>Nhân sự</th>
                  <th>Ngày tạo</th>
                  <th className={styles.actionsHeader}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((role) => {
                  const inUse = (role.userCount ?? 0) > 0;
                  const isLastAdmin = lastAdminRoleId === role.id;
                  const cannotDelete = inUse || isLastAdmin;
                  return (
                    <tr key={role.id}>
                      <td>
                        <strong>{roleLabel(role.name)}</strong>
                      </td>
                      <td className={role.description ? undefined : styles.mutedCell}>
                        {role.description || "Chưa có mô tả"}
                      </td>
                      <td>{role.userCount ?? 0}</td>
                      <td>{role.createdAt ? formatDate(role.createdAt) : "—"}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button type="button" className={styles.rowActionButton} onClick={() => openEdit(role)}>
                            Sửa
                          </button>
                          <button
                            type="button"
                            className={`${styles.rowActionButton} ${styles.rowActionDanger}`}
                            onClick={() => setDeleting(role)}
                            disabled={cannotDelete}
                            title={
                              isLastAdmin
                                ? "Không thể xóa vai trò Admin cuối cùng"
                                : inUse
                                  ? "Không thể xóa vai trò đang được gán cho nhân sự"
                                  : "Xóa vai trò"
                            }
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={isLoading ? "Đang tải danh sách vai trò" : "Chưa có vai trò"}
            description={
              isLoading
                ? "Hệ thống đang lấy dữ liệu vai trò hiện tại."
                : search.trim()
                  ? "Không tìm thấy vai trò khớp với từ khóa."
                  : "Nhấn “Thêm vai trò” để tạo vai trò đầu tiên."
            }
          />
        )}
      </Surface>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsFormOpen(false)}>
          <section
            className={`password-modal ${styles.addModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="password-modal-header">
              <div>
                <h2 id="role-form-title">{editing ? "Sửa vai trò" : "Thêm vai trò"}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setIsFormOpen(false)} aria-label="Đóng">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <form
              className={styles.addForm}
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              <label className={styles.filterField}>
                <span>
                  Tên vai trò
                  <span className="required-asterisk" aria-hidden="true">
                    *
                  </span>
                </span>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  placeholder="Ví dụ: Lập trình viên"
                  required
                />
              </label>
              <label className={styles.filterField}>
                <span>Mô tả</span>
                <textarea
                  value={descriptionDraft}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                  placeholder="Mô tả quyền hạn và phạm vi của vai trò"
                />
              </label>
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={isAdminDraft}
                  onChange={(event) => setIsAdminDraft(event.target.checked)}
                  disabled={editing?.id === lastAdminRoleId && editing?.isAdmin}
                />
                <span>
                  <strong>Quyền quản trị hệ thống</strong>
                  <small>Tài khoản gán vai trò này có thể quản lý nhân sự, phòng ban và vai trò.</small>
                </span>
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <div className={styles.addActions}>
                <button type="button" className="secondary-button" onClick={() => setIsFormOpen(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="primary-button" disabled={isSaving}>
                  {isSaving ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Tạo vai trò"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        title="Xóa vai trò"
        message={deleting ? `Bạn có chắc muốn xóa vai trò “${deleting.name}”? Thao tác này không thể hoàn tác.` : ""}
        confirmText="Xóa"
        cancelText="Hủy"
        isDanger
      />
    </>
  );
}
