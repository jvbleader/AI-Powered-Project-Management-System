"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";
import { EmptyState, Surface } from "@/components/ui";
import { formatDate } from "@/lib/utils/format";
import { userApi } from "@/services/api";
import type { Department } from "@/types";
import styles from "../styles/team.module.css";

interface DepartmentAdminPanelProps {
  onChanged?: () => void;
}

export function DepartmentAdminPanel({ onChanged }: DepartmentAdminPanelProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [deleting, setDeleting] = useState<Department | null>(null);

  async function loadDepartments() {
    const { data } = await userApi.getDepartments();
    setDepartments(data);
  }

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        await loadDepartments();
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : "Không thể tải danh sách phòng ban.");
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
    if (!keyword) return departments;
    return departments.filter((department) => {
      const haystack = `${department.name} ${department.description ?? ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [departments, search]);

  function openCreate() {
    setEditing(null);
    setNameDraft("");
    setDescriptionDraft("");
    setError(null);
    setNotice(null);
    setIsFormOpen(true);
  }

  function openEdit(department: Department) {
    setEditing(department);
    setNameDraft(department.name);
    setDescriptionDraft(department.description ?? "");
    setError(null);
    setNotice(null);
    setIsFormOpen(true);
  }

  async function handleSave() {
    if (!nameDraft.trim()) {
      setError("Vui lòng nhập tên phòng ban.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (editing) {
        const { data } = await userApi.updateDepartment(editing.id, {
          name: nameDraft.trim(),
          description: descriptionDraft.trim() || null,
        });
        setDepartments((current) => current.map((item) => (item.id === data.id ? data : item)));
        setNotice(`Đã cập nhật phòng ban ${data.name}.`);
      } else {
        const { data } = await userApi.createDepartment({
          name: nameDraft.trim(),
          description: descriptionDraft.trim() || null,
        });
        setDepartments((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name, "vi")));
        setNotice(`Đã tạo phòng ban ${data.name}.`);
      }
      setIsFormOpen(false);
      onChanged?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu phòng ban.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setError(null);
    setNotice(null);
    try {
      await userApi.deleteDepartment(deleting.id);
      setDepartments((current) => current.filter((item) => item.id !== deleting.id));
      setNotice(`Đã xóa phòng ban ${deleting.name}.`);
      setDeleting(null);
      onChanged?.();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa phòng ban.");
      setDeleting(null);
    }
  }

  return (
    <>
      {error && !isFormOpen ? <p className={`${styles.pageBanner} ${styles.pageBannerError}`}>{error}</p> : null}
      {notice && !isFormOpen ? <p className={`${styles.pageBanner} ${styles.pageBannerSuccess}`}>{notice}</p> : null}

      <Surface
        title="Danh sách phòng ban"
        className={styles.tableSurface}
        aside={
          <div className={styles.toolbarActions}>
            <label className={styles.toolbarSearch}>
              <span className={styles.srOnly}>Tìm phòng ban</span>
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
                placeholder="Tìm phòng ban"
              />
            </label>
            <button type="button" className={`primary-button ${styles.addUserButton}`} onClick={openCreate}>
              + Thêm phòng ban
            </button>
          </div>
        }
      >
        {filtered.length ? (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.compactTable}`}>
              <thead>
                <tr>
                  <th>Tên phòng ban</th>
                  <th>Mô tả</th>
                  <th>Nhân sự</th>
                  <th>Dự án</th>
                  <th>Ngày tạo</th>
                  <th className={styles.actionsHeader}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((department) => {
                  const inUse =
                    (department.userCount ?? 0) + (department.projectCount ?? 0) + (department.teamCount ?? 0) > 0;
                  return (
                    <tr key={department.id}>
                      <td>
                        <strong>{department.name}</strong>
                      </td>
                      <td className={department.description ? undefined : styles.mutedCell}>
                        {department.description || "Chưa có mô tả"}
                      </td>
                      <td>{department.userCount ?? 0}</td>
                      <td>{department.projectCount ?? 0}</td>
                      <td>{department.createdAt ? formatDate(department.createdAt) : "—"}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button type="button" className={styles.rowActionButton} onClick={() => openEdit(department)}>
                            Sửa
                          </button>
                          <button
                            type="button"
                            className={`${styles.rowActionButton} ${styles.rowActionDanger}`}
                            onClick={() => setDeleting(department)}
                            disabled={inUse}
                            title={inUse ? "Không thể xóa phòng ban đang được sử dụng" : "Xóa phòng ban"}
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
            title={isLoading ? "Đang tải danh sách phòng ban" : "Chưa có phòng ban"}
            description={
              isLoading
                ? "Hệ thống đang lấy dữ liệu phòng ban hiện tại."
                : search.trim()
                  ? "Không tìm thấy phòng ban khớp với từ khóa."
                  : "Nhấn “Thêm phòng ban” để tạo phòng ban đầu tiên."
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
            aria-labelledby="department-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="password-modal-header">
              <div>
                <h2 id="department-form-title">{editing ? "Sửa phòng ban" : "Thêm phòng ban"}</h2>
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
                  Tên phòng ban
                  <span className="required-asterisk" aria-hidden="true">
                    *
                  </span>
                </span>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  placeholder="Ví dụ: Chuyển đổi số"
                  required
                />
              </label>
              <label className={styles.filterField}>
                <span>Mô tả</span>
                <textarea
                  value={descriptionDraft}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                  placeholder="Mô tả ngắn về phòng ban"
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <div className={styles.addActions}>
                <button type="button" className="secondary-button" onClick={() => setIsFormOpen(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="primary-button" disabled={isSaving}>
                  {isSaving ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Tạo phòng ban"}
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
        title="Xóa phòng ban"
        message={deleting ? `Bạn có chắc muốn xóa phòng ban “${deleting.name}”? Thao tác này không thể hoàn tác.` : ""}
        confirmText="Xóa"
        cancelText="Hủy"
        isDanger
      />
    </>
  );
}
