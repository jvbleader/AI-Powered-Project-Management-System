"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Xác nhận",
  message = "Bạn có chắc chắn không?",
  confirmText = "Đồng ý",
  cancelText = "Hủy",
  isDanger = true,
}: ConfirmModalProps) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          background: "#fff",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "400px",
          padding: "1.5rem",
          boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, color: "var(--ink)" }}>
          {title}
        </h3>
        <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--foreground-muted)", lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.75rem" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              fontWeight: 500,
              background: "rgba(15, 23, 42, 0.05)",
              color: "var(--ink)",
              border: "1px solid transparent",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(15, 23, 42, 0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(15, 23, 42, 0.05)")}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              fontWeight: 500,
              background: isDanger ? "#dc2626" : "var(--accent)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              if (isDanger) e.currentTarget.style.background = "#b91c1c";
              else e.currentTarget.style.filter = "brightness(0.9)";
            }}
            onMouseLeave={(e) => {
              if (isDanger) e.currentTarget.style.background = "#dc2626";
              else e.currentTarget.style.filter = "none";
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
