import { redirect } from "next/navigation";

import LoginForm from "@/app/login/form";
import { SoftwareLogo } from "@/components/software-logo";
import { hasValidServerSession } from "@/lib/auth/server";

import styles from "../../components/styles/auth-shell.module.css";

export default async function LoginPage() {
  if (await hasValidServerSession()) {
    redirect("/dashboard");
  }

  return (
    <main className={styles.screen}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <SoftwareLogo subtitle="" />
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
