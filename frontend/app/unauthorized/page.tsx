import Link from "next/link";
import styles from "./unauthorized.module.css";

export default function UnauthorizedPage() {
  return (
    <main className={styles.screen}>
      <section className={styles.card}>
        <div className={styles.iconWrapper}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.icon}
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        
        <h1 className={styles.title}>Truy cập bị từ chối</h1>
        <p className={styles.description}>
          Phiên đăng nhập đã hết hạn hoặc bạn không có quyền truy cập vào không gian này.
        </p>

        <div className={styles.actions}>
          <Link href="/login" className={styles.primaryButton}>
            Đi tới Đăng nhập
          </Link>
        </div>
      </section>
    </main>
  );
}
