import type { ReactNode } from "react";

import { ProtectedRoute } from "@/components/protected-route";
import { requireServerSession } from "@/services/auth/server";
import { NotificationProvider } from "@/contexts/notification-context";
import { AssistantProvider } from "@/contexts/assistant-context";
import { AssistantHost } from "@/components/assistant-host";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await requireServerSession();

  return (
    <ProtectedRoute>
      <NotificationProvider>
        <AssistantProvider>
          {children}
          <AssistantHost />
        </AssistantProvider>
      </NotificationProvider>
    </ProtectedRoute>
  );
}
