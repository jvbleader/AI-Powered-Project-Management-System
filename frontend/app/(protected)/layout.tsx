import type { ReactNode } from "react";

import { ProtectedRoute } from "@/components/protected-route";
import { requireServerSession } from "@/lib/auth/server";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await requireServerSession();

  return <ProtectedRoute>{children}</ProtectedRoute>;
}
