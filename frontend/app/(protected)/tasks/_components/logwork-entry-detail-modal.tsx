"use client";

import { useRouter } from "next/navigation";
import { formatDate, formatDateTime, formatHours } from "@/lib/utils/format";
import type { TaskLogworkEntry } from "@/types";
import modalStyles from "../../projects/_components/create-project-modal.module.css";
import styles from "./logwork-entry-detail-modal.module.css";

function logworkStatusLabel(status: TaskLogworkEntry["status"]) {
  if (status === "APPROVED") return "Đã duyệt";
  if (status === "REJECTED") return "Từ chối";
  return "Chờ duyệt";
}

interface LogworkEntryDetailModalProps {
  entry: TaskLogworkEntry | null;
  isOpen: boolean;
  onClose: () => void;
  canGoToApprovals?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
}

export function LogworkEntryDetailModal({
  entry,
  isOpen,
  onClose,
  canGoToApprovals = false,
  canEdit = false,
  onEdit,
}: LogworkEntryDetailModalProps) {
  const router = useRouter();

  if (!isOpen || !entry) return null;

  const handleGoToApprovals = () => {
    onClose();
    router.push(`/logwork-approvals?highlightLogworkId=${encodeURIComponent(entry.id)}`);
  };

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={`${modalStyles.modalSurface} ${styles.surface}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logwork-entry-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`${modalStyles.modalHeader} ${styles.header}`}>
          <div>
            <p className={styles.kicker}>Chi tiết logwork</p>
            <h2 id="logwork-entry-title" className={styles.title}>
              {entry.userName}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng popup" className={styles.closeButton}>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={`${modalStyles.modalBody} ${styles.body}`}>
          <div className={styles.metaPanel}>
            <dl className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <dt>Ngày làm việc</dt>
                <dd>{formatDate(entry.workDate)}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt>Số giờ</dt>
                <dd>{formatHours(entry.hoursSpent)}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt>Trạng thái</dt>
                <dd>
                  <span className={`${styles.statusBadge} ${styles[`status_${entry.status}`]}`}>
                    {logworkStatusLabel(entry.status)}
                  </span>
                </dd>
              </div>
              <div className={styles.metaItem}>
                <dt>Ghi nhận lúc</dt>
                <dd>{formatDateTime(entry.createdAt)}</dd>
              </div>
            </dl>
          </div>

          <div className={styles.sectionPanel}>
            <span className={styles.sectionLabel}>Nội dung công việc</span>
            <div className={styles.contentBox}>
              {entry.workContent?.trim() || "— Không có mô tả —"}
            </div>
          </div>

          {entry.comment?.trim() ? (
            <div className={styles.sectionPanel}>
              <span className={styles.sectionLabel}>Ghi chú</span>
              <div className={styles.contentBox}>{entry.comment.trim()}</div>
            </div>
          ) : null}
        </div>

        <div className={`${modalStyles.modalFooter} ${styles.footer}`}>
          <button type="button" className={modalStyles.btnSecondary} onClick={onClose}>
            Đóng
          </button>
          {canEdit && onEdit ? (
            <button type="button" className={modalStyles.btnPrimary} onClick={() => { onClose(); onEdit(); }}>
              Sửa logwork
            </button>
          ) : canGoToApprovals ? (
            <button type="button" className={modalStyles.btnPrimary} onClick={handleGoToApprovals}>
              Chuyển tới duyệt logwork
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
