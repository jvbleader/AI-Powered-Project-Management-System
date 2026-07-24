import { useRouter } from "next/navigation";
import { signOut, signOutAll } from "@/services/auth/session";

type SignOutModalProps = {
  onClose: () => void;
};

export function SignOutModal({ onClose }: SignOutModalProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const handleSignOutAll = async () => {
    await signOutAll();
    router.push("/login");
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="password-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-out-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ maxWidth: "400px", padding: "24px" }}
      >
        <div style={{ marginBottom: "20px" }}>
          <h2 id="sign-out-title" style={{ marginTop: 0, marginBottom: "8px", fontSize: "1.25rem", fontWeight: 600 }}>
            Tùy chọn đăng xuất
          </h2>
          <p style={{ margin: 0, color: "var(--foreground-muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>
            Bạn muốn đăng xuất khỏi thiết bị này hay tất cả các thiết bị?
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              padding: "12px 16px",
              background: "var(--surface-strong)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              cursor: "pointer",
              textAlign: "left",
              transition: "background 0.2s"
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
            onMouseOut={(e) => (e.currentTarget.style.background = "var(--surface-strong)")}
          >
            <div style={{ fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>Đăng xuất</div>
            <div style={{ fontSize: "0.8rem", color: "var(--foreground-muted)" }}>Chỉ thoát khỏi phiên hiện tại</div>
          </button>

          <button
            type="button"
            onClick={handleSignOutAll}
            style={{
              padding: "12px 16px",
              background: "var(--danger-bg, #fee2e2)",
              border: "1px solid var(--danger-border, #fca5a5)",
              borderRadius: "8px",
              cursor: "pointer",
              textAlign: "left",
              transition: "opacity 0.2s"
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <div style={{ fontWeight: 600, color: "var(--danger-foreground, #dc2626)", marginBottom: "4px" }}>Đăng xuất tất cả</div>
            <div style={{ fontSize: "0.8rem", color: "var(--danger-foreground, #dc2626)", opacity: 0.8 }}>Thoát khỏi tất cả các thiết bị</div>
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "12px",
              background: "transparent",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 500,
              color: "var(--foreground-muted)",
              marginTop: "4px"
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = "var(--surface-strong)")}
            onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Hủy
          </button>
        </div>
      </section>
    </div>
  );
}
