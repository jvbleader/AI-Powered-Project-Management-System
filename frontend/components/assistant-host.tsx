"use client";

import { usePathname } from "next/navigation";

import { AssistantBubble } from "@/components/assistant-bubble";

export function AssistantHost() {
  const pathname = usePathname();
  const projectMatch = pathname?.match(/^\/projects\/([^/?]+)/);
  const projectId = projectMatch?.[1] ?? null;

  return <AssistantBubble projectId={projectId} />;
}
