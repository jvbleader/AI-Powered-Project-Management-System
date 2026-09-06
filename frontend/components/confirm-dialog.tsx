"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import styles from "./confirm-dialog.module.css";

export type ConfirmTone = "primary" | "danger";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

export type AlertOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
};

type ConfirmRequest = {
  mode: "confirm";
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmTone;
  resolve: (value: boolean) => void;
};

type AlertRequest = {
  mode: "alert";
  title: string;
  message: string;
  confirmLabel: string;
  resolve: (value: boolean) => void;
};

type DialogRequest = ConfirmRequest | AlertRequest;

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
};

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error("useConfirmDialog must be used within ConfirmDialogProvider");
  }
  return context;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const requestRef = useRef<DialogRequest | null>(null);

  const closeWith = useCallback((value: boolean) => {
    const current = requestRef.current;
    if (!current) return;
    requestRef.current = null;
    setRequest(null);
    current.resolve(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      if (requestRef.current) {
        requestRef.current.resolve(false);
      }
      const next: ConfirmRequest = {
        mode: "confirm",
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? "Xác nhận",
        cancelLabel: options.cancelLabel ?? "Hủy",
        tone: options.tone ?? "primary",
        resolve,
      };
      requestRef.current = next;
      setRequest(next);
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string) => {
    const payload = typeof options === "string" ? { message: options } : options;
    return new Promise<void>((resolve) => {
      if (requestRef.current) {
        requestRef.current.resolve(false);
      }
      const next: AlertRequest = {
        mode: "alert",
        title: payload.title ?? "Thông báo",
        message: payload.message,
        confirmLabel: payload.confirmLabel ?? "Đóng",
        resolve: () => resolve(),
      };
      requestRef.current = next;
      setRequest(next);
    });
  }, []);

  useEffect(() => {
    if (!request) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeWith(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeWith, request]);

  const value = useMemo(() => ({ confirm, alert }), [alert, confirm]);

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      {request ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={() => closeWith(false)}
        >
          <section
            className={styles.surface}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.header}>
              <h2 id="confirm-dialog-title" className={styles.title}>
                {request.title}
              </h2>
              <button
                type="button"
                className={styles.closeButton}
                aria-label="Đóng"
                onClick={() => closeWith(false)}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p id="confirm-dialog-message" className={styles.message}>
              {request.message}
            </p>
            <div className={styles.footer}>
              {request.mode === "confirm" ? (
                <button type="button" className={styles.cancelButton} onClick={() => closeWith(false)}>
                  {request.cancelLabel}
                </button>
              ) : null}
              <button
                type="button"
                className={
                  request.mode === "alert" || request.tone === "primary"
                    ? styles.confirmButton
                    : styles.dangerButton
                }
                onClick={() => closeWith(true)}
              >
                {request.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </ConfirmDialogContext.Provider>
  );
}
