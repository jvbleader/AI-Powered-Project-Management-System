import type { ReactNode } from "react";

import { ProtectedRoute } from "@/components/protected-route";
import { requireServerSession } from "@/services/auth/server";
import { NotificationProvider } from "@/contexts/notification-context";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await requireServerSession();

  return (
    <ProtectedRoute>
      <NotificationProvider>
        {children}
      </NotificationProvider>
    </ProtectedRoute>
  );
}
