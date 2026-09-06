import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "@/components/app-providers";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Backlog",
  description:
    "AI-powered project management UI with real backend service contracts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light only" />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
