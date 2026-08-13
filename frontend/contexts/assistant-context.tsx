"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { aiApi } from "@/services/api";
import { getApiBaseUrl } from "@/services/api/core";
import {
  clearAssistantSessionStorage,
  getStoredActiveSessionId,
  markDraftFenceInContent,
  setStoredActiveSessionId,
  setStoredDraftStatus,
} from "@/lib/assistant-storage";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
  hasFetched?: boolean;
};

type StreamMeta = {
  controller: AbortController;
  loadingMessageId: string;
};

type AssistantContextValue = {
  isOpen: boolean;
  setIsOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  view: "chat" | "history";
  setView: (view: "chat" | "history") => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  activeSession: ChatSession | undefined;
  messages: ChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  isActiveStreaming: boolean;
  streamingSessionIds: string[];
  activeLoadingMessageId: string | null;
  createNewSession: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  submitPrompt: (prompt: string, projectId?: string | null) => Promise<void>;
  pauseSession: (sessionId?: string | null) => void;
  updateMessageContent: (messageId: string, content: string) => void;
  resolveDraftMessage: (messageId: string, status: "confirmed" | "rejected") => void;
};

const AssistantContext = createContext<AssistantContextValue | undefined>(undefined);

function createUserMessage(content: string): ChatMessage {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    content,
  };
}

function createLocalSession(): ChatSession {
  return {
    id: `sess-${Date.now()}`,
    title: "Cuộc trò chuyện mới",
    createdAt: new Date().toISOString(),
    messages: [],
  };
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [streamingSessionIds, setStreamingSessionIds] = useState<string[]>([]);
  const streamsRef = useRef<Record<string, StreamMeta>>({});
  const sessionsRef = useRef(sessions);
  const activeSessionIdRef = useRef(activeSessionId);
  const initializedRef = useRef(false);

  sessionsRef.current = sessions;
  activeSessionIdRef.current = activeSessionId;

  useEffect(() => {
    if (activeSessionId) {
      setStoredActiveSessionId(activeSessionId);
    }
  }, [activeSessionId]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [sessions, activeSessionId],
  );
  const messages = activeSession?.messages || [];
  const isActiveStreaming = Boolean(
    activeSessionId && streamingSessionIds.includes(activeSessionId),
  );
  const activeLoadingMessageId = activeSessionId
    ? streamsRef.current[activeSessionId]?.loadingMessageId ?? null
    : null;

  const startStream = useCallback((sessionId: string, meta: StreamMeta) => {
    streamsRef.current[sessionId] = meta;
    setStreamingSessionIds((current) =>
      current.includes(sessionId) ? current : [...current, sessionId],
    );
  }, []);

  const endStream = useCallback((sessionId: string) => {
    delete streamsRef.current[sessionId];
    setStreamingSessionIds((current) => current.filter((id) => id !== sessionId));
  }, []);

  const retargetStream = useCallback((fromId: string, toId: string) => {
    const meta = streamsRef.current[fromId];
    if (!meta) return;
    delete streamsRef.current[fromId];
    streamsRef.current[toId] = meta;
    setStreamingSessionIds((current) => {
      const withoutOld = current.filter((id) => id !== fromId);
      return withoutOld.includes(toId) ? withoutOld : [...withoutOld, toId];
    });
  }, []);

  const pauseSession = useCallback((sessionId?: string | null) => {
    const targetId = sessionId || activeSessionIdRef.current;
    if (!targetId) return;
    streamsRef.current[targetId]?.controller.abort();
  }, []);

  const fetchedSessionIdsRef = useRef<Set<string>>(new Set());

  const ensureSession = useCallback(() => {
    const currentId = activeSessionIdRef.current;
    if (currentId) return currentId;

    const localSession = createLocalSession();
    activeSessionIdRef.current = localSession.id;
    setSessions((current) => [localSession, ...current]);
    setActiveSessionId(localSession.id);
    return localSession.id;
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    aiApi
      .getSessions()
      .then((data: any[]) => {
        const mappedSessions: ChatSession[] = data.map((session) => ({
          id: String(session.id),
          title: session.title,
          createdAt: session.created_at,
          messages: [],
        }));
        const storedId = getStoredActiveSessionId();
        const busyIds = new Set([
          ...Object.keys(streamsRef.current),
          ...sessionsRef.current
            .filter((session) => session.messages.length > 0)
            .map((session) => session.id),
        ]);

        let fallbackLocalId: string | null = null;

        setSessions((current) => {
          const keep = current.filter(
            (session) =>
              busyIds.has(session.id) ||
              session.messages.length > 0 ||
              Object.prototype.hasOwnProperty.call(streamsRef.current, session.id),
          );
          if (keep.length > 0) {
            const keepIds = new Set(keep.map((session) => session.id));
            const fromDb = mappedSessions.filter((session) => !keepIds.has(session.id));
            return [...keep, ...fromDb];
          }

          if (storedId && mappedSessions.some((session) => session.id === storedId)) {
            return mappedSessions;
          }

          if (mappedSessions.length === 0) {
            if (current.length > 0) return current;
            const localSession = createLocalSession();
            fallbackLocalId = localSession.id;
            return [localSession];
          }

          return mappedSessions;
        });

        if (activeSessionIdRef.current) {
          return;
        }

        if (storedId && mappedSessions.some((session) => session.id === storedId)) {
          setActiveSessionId(storedId);
          return;
        }

        if (mappedSessions.length > 0) {
          setActiveSessionId(mappedSessions[0].id);
          return;
        }

        if (fallbackLocalId) {
          setActiveSessionId(fallbackLocalId);
        }
      })
      .catch((error) => {
        console.error("Lỗi khi tải session từ DB", error);
        if (activeSessionIdRef.current) return;
        const localSession = createLocalSession();
        setSessions([localSession]);
        setActiveSessionId(localSession.id);
      });
  }, []);

  useEffect(() => {
    if (!activeSessionId || activeSessionId.startsWith("sess-")) return;
    if (fetchedSessionIdsRef.current.has(activeSessionId)) return;
    fetchedSessionIdsRef.current.add(activeSessionId);

    aiApi
      .getSessionMessages(activeSessionId)
      .then((data: any[]) => {
        if (!data || data.length === 0) return;
        const fetchedMessages: ChatMessage[] = data.map((message) => ({
          id: String(message.id),
          role: message.sender,
          content: message.content,
        }));
        setSessions((current) =>
          current.map((session) => {
            if (session.id !== activeSessionId) return session;
            if (session.messages.length > 0) return session;
            return { ...session, messages: fetchedMessages, hasFetched: true };
          }),
        );
      })
      .catch(console.error);
  }, [activeSessionId]);

  const setMessages = useCallback(
    (updater: (current: ChatMessage[]) => ChatMessage[], overrideSessionId?: string) => {
      setSessions((current) => {
        const targetId = overrideSessionId || activeSessionIdRef.current;
        if (!targetId) return current;
        return current.map((session) => {
          if (session.id !== targetId) return session;
          const newMessages = updater(session.messages);
          let newTitle = session.title;
          if (newTitle === "Cuộc trò chuyện mới" && newMessages.length > 0) {
            const firstUserMsg = newMessages.find((message) => message.role === "user");
            if (firstUserMsg) {
              const words = firstUserMsg.content.trim().split(/\s+/);
              newTitle = words.slice(0, 6).join(" ") + (words.length > 6 ? "..." : "");
              if (!targetId.startsWith("sess-")) {
                aiApi.updateSession(targetId, newTitle).catch(console.error);
              }
            }
          }
          return { ...session, title: newTitle, messages: newMessages };
        });
      });
    },
    [],
  );

  const updateMessageContent = useCallback((messageId: string, content: string) => {
    setSessions((current) =>
      current.map((session) => ({
        ...session,
        messages: session.messages.map((message) =>
          message.id === messageId ? { ...message, content } : message,
        ),
      })),
    );
  }, []);

  const resolveDraftMessage = useCallback(
    (messageId: string, status: "confirmed" | "rejected") => {
      setStoredDraftStatus(messageId, status);
      setSessions((current) =>
        current.map((session) => ({
          ...session,
          messages: session.messages.map((message) =>
            message.id === messageId
              ? { ...message, content: markDraftFenceInContent(message.content, status) }
              : message,
          ),
        })),
      );
    },
    [],
  );

  const createNewSession = useCallback(async () => {
    const currentActive = sessionsRef.current.find(
      (session) => session.id === activeSessionIdRef.current,
    );
    if (currentActive && currentActive.messages.length === 0) {
      setView("chat");
      return;
    }
    try {
      const dbSession = await aiApi.createSession("Cuộc trò chuyện mới");
      const newSession: ChatSession = {
        id: String(dbSession.id),
        title: dbSession.title,
        createdAt: dbSession.created_at,
        messages: [],
      };
      setSessions((current) => [newSession, ...current]);
      setActiveSessionId(newSession.id);
      setView("chat");
    } catch (error) {
      console.error(error);
    }
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    pauseSession(id);
    if (!id.startsWith("sess-")) {
      await aiApi.clearSession(id).catch(console.error);
    }
    setSessions((current) => {
      const updated = current.filter((session) => session.id !== id);
      if (updated.length === 0) {
        const localSession = createLocalSession();
        setActiveSessionId(localSession.id);
        return [localSession];
      }
      if (activeSessionIdRef.current === id) {
        setActiveSessionId(updated[0].id);
      }
      return updated;
    });
  }, [pauseSession]);

  const patchMessage = useCallback(
    (messageId: string, patch: { content?: string; id?: string }) => {
      setSessions((current) =>
        current.map((session) => {
          if (!session.messages.some((message) => message.id === messageId)) {
            return session;
          }
          return {
            ...session,
            messages: session.messages.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    content: patch.content !== undefined ? patch.content : message.content,
                    id: patch.id || message.id,
                  }
                : message,
            ),
          };
        }),
      );
    },
    [],
  );

  const submitPrompt = useCallback(
    async (rawPrompt: string, projectId?: string | null) => {
      const cleanPrompt = rawPrompt.trim();
      if (!cleanPrompt) return;

      let targetSessionId = ensureSession();

      setIsOpen(true);
      setDraft("");
      setView("chat");

      const loadingMessageId = `assistant-loading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const controller = new AbortController();
      let finalMessageId = `assistant-${Date.now()}`;

      startStream(targetSessionId, { controller, loadingMessageId });
      setMessages(
        (current) => [
          ...current,
          createUserMessage(cleanPrompt),
          { id: loadingMessageId, role: "assistant", content: "" },
        ],
        targetSessionId,
      );

      if (targetSessionId.startsWith("sess-")) {
        try {
          const dbSession = await aiApi.createSession("Cuộc trò chuyện mới");
          const newId = String(dbSession?.id ?? "");
          if (!newId || newId === "undefined") {
            throw new Error("Không tạo được phiên chat.");
          }
          const oldId = targetSessionId;
          fetchedSessionIdsRef.current.add(newId);
          activeSessionIdRef.current = newId;
          retargetStream(oldId, newId);
          setSessions((current) => {
            const renamed = current.map((session) =>
              session.id === oldId ? { ...session, id: newId } : session,
            );
            if (renamed.some((session) => session.id === newId)) {
              return renamed;
            }
            return [
              {
                id: newId,
                title: dbSession.title || "Cuộc trò chuyện mới",
                createdAt: dbSession.created_at || new Date().toISOString(),
                messages: [],
              },
              ...current,
            ];
          });
          setActiveSessionId(newId);
          targetSessionId = newId;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Không tạo được phiên chat.";
          patchMessage(loadingMessageId, { content: errorMsg });
          endStream(targetSessionId);
          return;
        }
      }

      try {
        let response = await fetch(`${getApiBaseUrl()}${aiApi.streamChatUrl}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            session_id: targetSessionId,
            message: cleanPrompt,
            project_id: projectId ? Number(projectId) : null,
          }),
        });

        if (response.status === 401) {
          await aiApi.classifyIntent({ prompt: "ping" }).catch(() => {});
          response = await fetch(`${getApiBaseUrl()}${aiApi.streamChatUrl}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            signal: controller.signal,
            body: JSON.stringify({
              session_id: targetSessionId,
              message: cleanPrompt,
              project_id: projectId ? Number(projectId) : null,
            }),
          });
        }

        if (!response.ok) {
          throw new Error(`Lỗi kết nối tới AI (Mã lỗi: ${response.status})`);
        }
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";
        let toolCallStr = "";
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          while (buffer.includes("\n\n")) {
            const splitIndex = buffer.indexOf("\n\n");
            const line = buffer.slice(0, splitIndex);
            buffer = buffer.slice(splitIndex + 2);

            if (!line.startsWith("data: ")) continue;
            const dataStr = line.substring(6);
            if (dataStr === "[DONE]") continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.chunk) {
                toolCallStr = "";
                assistantContent += data.chunk;
                patchMessage(loadingMessageId, { content: toolCallStr + assistantContent });
              } else if (data.tool_call) {
                toolCallStr = `_[Đang gọi công cụ ${data.tool_call}...]_\n\n`;
                patchMessage(loadingMessageId, { content: toolCallStr + assistantContent });
              } else if (data.replace !== undefined) {
                toolCallStr = "";
                assistantContent = data.replace;
                patchMessage(loadingMessageId, { content: assistantContent });
              } else if (data.error) {
                assistantContent += `\n\n**Lỗi:** ${data.error}`;
                patchMessage(loadingMessageId, { content: assistantContent });
              } else if (data.new_session_id) {
                const newId = String(data.new_session_id);
                activeSessionIdRef.current = newId;
                retargetStream(targetSessionId, newId);
                setSessions((current) =>
                  current.map((session) =>
                    session.id === targetSessionId ? { ...session, id: newId } : session,
                  ),
                );
                setActiveSessionId((current) => (current === targetSessionId ? newId : current));
                targetSessionId = newId;
              } else if (data.message_id) {
                finalMessageId = String(data.message_id);
                patchMessage(loadingMessageId, {
                  id: finalMessageId,
                  content: assistantContent || undefined,
                });
              }
            } catch {
              // Ignore incomplete SSE chunks
            }
          }
        }
      } catch (error: any) {
        if (error?.name === "AbortError") {
          return;
        }
        const errorMsg = error instanceof Error ? error.message : "Không thể kết nối với AI.";
        patchMessage(loadingMessageId, { content: errorMsg });
      } finally {
        patchMessage(loadingMessageId, { id: finalMessageId });
        endStream(targetSessionId);
      }
    },
    [endStream, ensureSession, patchMessage, retargetStream, setMessages, startStream],
  );

  const value = useMemo<AssistantContextValue>(
    () => ({
      isOpen,
      setIsOpen,
      view,
      setView,
      sessions,
      activeSessionId,
      setActiveSessionId,
      activeSession,
      messages,
      draft,
      setDraft,
      isActiveStreaming,
      streamingSessionIds,
      activeLoadingMessageId,
      createNewSession,
      deleteSession,
      submitPrompt,
      pauseSession,
      updateMessageContent,
      resolveDraftMessage,
    }),
    [
      isOpen,
      view,
      sessions,
      activeSessionId,
      activeSession,
      messages,
      draft,
      isActiveStreaming,
      streamingSessionIds,
      activeLoadingMessageId,
      createNewSession,
      deleteSession,
      submitPrompt,
      pauseSession,
      updateMessageContent,
      resolveDraftMessage,
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) {
    throw new Error("useAssistant must be used within an AssistantProvider");
  }
  return context;
}
