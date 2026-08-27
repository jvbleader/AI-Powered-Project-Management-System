import {
  clearAssistantSessionStorage,
  clearStoredDraftStatus,
  getDraftStatusStorageKey,
  getStoredActiveSessionId,
  getStoredDraftStatus,
  isPersistedMessageId,
  markDraftFenceInContent,
  setStoredActiveSessionId,
  setStoredDraftStatus,
} from "./assistant-storage";

describe("Assistant Storage Utilities", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("Active Session Storage", () => {
    it("should return null when no session is stored", () => {
      expect(getStoredActiveSessionId()).toBeNull();
    });

    it("should store and retrieve active session id", () => {
      setStoredActiveSessionId("123");
      expect(getStoredActiveSessionId()).toBe("123");
    });

    it("should clear stored active session id", () => {
      setStoredActiveSessionId("123");
      clearAssistantSessionStorage();
      expect(getStoredActiveSessionId()).toBeNull();
    });
  });

  describe("Draft Status Storage", () => {
    it("should generate correct storage key for draft message", () => {
      expect(getDraftStatusStorageKey("456")).toBe("draft_status_456");
    });

    it("should store and retrieve confirmed draft status", () => {
      setStoredDraftStatus("456", "confirmed");
      expect(getStoredDraftStatus("456")).toBe("confirmed");
    });

    it("should store and retrieve rejected draft status", () => {
      setStoredDraftStatus("456", "rejected");
      expect(getStoredDraftStatus("456")).toBe("rejected");
    });

    it("should clear stored draft status", () => {
      setStoredDraftStatus("456", "confirmed");
      clearStoredDraftStatus("456");
      expect(getStoredDraftStatus("456")).toBeNull();
    });

    it("should ignore invalid non-numeric message ids", () => {
      expect(isPersistedMessageId("temp-123")).toBe(false);
      expect(isPersistedMessageId("456")).toBe(true);
      expect(isPersistedMessageId(null)).toBe(false);
      expect(isPersistedMessageId(undefined)).toBe(false);

      setStoredDraftStatus("temp-123", "confirmed");
      expect(getStoredDraftStatus("temp-123")).toBeNull();
    });
  });

  describe("markDraftFenceInContent", () => {
    it("should transform task draft fence to confirmed fence", () => {
      const content = "Dưới đây là draft:\n```json_task_draft\n[{\"title\": \"Task 1\"}]\n```";
      const result = markDraftFenceInContent(content, "confirmed");
      expect(result).toContain("```json_task_draft_confirmed");
    });

    it("should transform sprint draft fence to confirmed fence", () => {
      const content = "Dưới đây là draft:\n```json_sprint_draft\n[{\"name\": \"Sprint 1\"}]\n```";
      const result = markDraftFenceInContent(content, "confirmed");
      expect(result).toContain("```json_sprint_draft_confirmed");
    });

    it("should transform sprint status draft fence to rejected fence", () => {
      const content = "Dưới đây là draft:\n```json_sprint_status_draft\n[{\"status\": \"active\"}]\n```";
      const result = markDraftFenceInContent(content, "rejected");
      expect(result).toContain("```json_sprint_status_draft_rejected");
    });

    it("should not double-transform already confirmed or rejected fences", () => {
      const content = "```json_task_draft_confirmed\n[{\"title\": \"Task 1\"}]\n```";
      const result = markDraftFenceInContent(content, "rejected");
      expect(result).toBe(content);
    });
  });
});
