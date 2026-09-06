"use client";

import type { ReactNode } from "react";

import { ConfirmDialogProvider } from "@/components/confirm-dialog";

export function AppProviders({ children }: { children: ReactNode }) {
  return <ConfirmDialogProvider>{children}</ConfirmDialogProvider>;
}
