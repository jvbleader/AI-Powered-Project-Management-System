const ACTIVE_SESSION_KEY = "flowpilot-assistant-active-session";

export function getStoredActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_SESSION_KEY);
}

export function setStoredActiveSessionId(sessionId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
}

export function clearAssistantSessionStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_SESSION_KEY);
}

export function getDraftStatusStorageKey(messageId: string) {
  return `draft_status_${messageId}`;
}

export function getStoredDraftStatus(messageId?: string) {
  if (!messageId || !isPersistedMessageId(messageId) || typeof window === "undefined") return null;
  return window.localStorage.getItem(getDraftStatusStorageKey(messageId));
}

export function setStoredDraftStatus(messageId: string, status: "confirmed" | "rejected") {
  if (!messageId || !isPersistedMessageId(messageId) || typeof window === "undefined") return;
  window.localStorage.setItem(getDraftStatusStorageKey(messageId), status);
}

export function clearStoredDraftStatus(messageId: string) {
  if (!messageId || !isPersistedMessageId(messageId) || typeof window === "undefined") return;
  window.localStorage.removeItem(getDraftStatusStorageKey(messageId));
}

export function isPersistedMessageId(messageId?: string | null) {
  return Boolean(messageId && /^\d+$/.test(messageId));
}

const DRAFT_FENCE_PATTERN =
  /```json_(task_draft|sprint_draft|sprint_status_draft)(?!_(?:confirmed|rejected))\b/g;

export function markDraftFenceInContent(
  content: string,
  status: "confirmed" | "rejected",
) {
  return content.replace(DRAFT_FENCE_PATTERN, (_match, kind: string) => {
    return `\`\`\`json_${kind}_${status}`;
  });
}
