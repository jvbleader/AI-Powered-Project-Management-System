import { redirect } from "next/navigation";

import { hasValidServerSession } from "@/lib/auth/server";

export default async function HomePage() {
  redirect((await hasValidServerSession()) ? "/dashboard" : "/login");
}
