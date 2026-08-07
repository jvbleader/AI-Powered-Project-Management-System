"use client";

import { useEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";

import ReactMarkdown from "react-markdown";

import { aiApi, projectApi } from "@/services/api";
import { getApiBaseUrl } from "@/services/api/core";
import {
  AiQuickResponse,
  AiQuickResponseAction,
  AiQuickResponseRequest,
} from "@/types";
import { TaskDraftConfirm } from "./task-draft-confirm";
import { SprintDraftConfirm } from "./sprint-draft-confirm";

type SuggestedPrompt = {
  action: AiQuickResponseAction;
  prompt: string;
};



type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: AiQuickResponse;
};

type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
};

const suggestedPrompts: SuggestedPrompt[] = [
  {
    action: "daily_priority",
    prompt: "Hôm nay tôi nên chú ý việc gì trước?",
  },
  {
    action: "stalled_tasks",
    prompt: "Task nào đang đứng yên?",
  },
  {
    action: "critical_overdue",
    prompt: "Task nào đang trễ hạn đáng lo nhất?",
  },
  {
    action: "follow_up_members",
    prompt: "Ai cần được nhắc hôm nay?",
  },
  {
    action: "leader_brief",
    prompt: "Viết cho tôi 4 dòng cập nhật để báo leader.",
  },
];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatGeneratedAt(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "Mới cập nhật";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function normalizePrompt(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTaskId(prompt: string) {
  const match = prompt.match(/\btask[-\s]?(\d+)\b/i);
  return match ? match[1] : null;
}



function createAssistantMessage(content: string, response?: AiQuickResponse): ChatMessage {
  return {
    id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "assistant",
    content,
    response,
  };
}

function createUserMessage(content: string): ChatMessage {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    content,
  };
}

function initialMessages(): ChatMessage[] {
  return [];
}

const MemoizedMarkdown = memo(({ content, messageId, projectId }: { content: string, messageId: string, projectId?: string | null }) => {
  const components = useMemo(() => ({
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-json_task_draft(?:_(confirmed|rejected))?/.exec(className || "");
      if (!inline && match) {
        const initialStatus = match[1] || "pending"; // "confirmed" | "rejected" | "pending"
        return <TaskDraftConfirm draft={String(children)} projectId={projectId} messageId={messageId} initialStatus={initialStatus as any} />;
      }
      const sprintMatch = /language-json_sprint_draft(?:_(confirmed|rejected))?/.exec(className || "");
      if (!inline && sprintMatch) {
        const initialStatus = sprintMatch[1] || "pending"; // "confirmed" | "rejected" | "pending"
        return <SprintDraftConfirm draft={String(children)} projectId={projectId} messageId={messageId} initialStatus={initialStatus as any} />;
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
  }), [messageId, projectId]);

  return <ReactMarkdown components={components}>{content}</ReactMarkdown>;
});

export function AssistantBubble({
  alertCount,
  projectId,
}: {
  alertCount: number;
  projectId?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPortalReady, setIsPortalReady] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId), [sessions, activeSessionId]);
  const messages = activeSession?.messages || [];

  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const messageStackRef = useRef<HTMLDivElement | null>(null);
  const isAutoScrollEnabledRef = useRef<boolean>(true);

  const promptChips = useMemo(() => suggestedPrompts.slice(0, 4), []);

  useEffect(() => {
    setIsPortalReady(true);
    // Tải danh sách sessions từ API
    aiApi.getSessions().then((data: any[]) => {
      if (data.length > 0) {
        const mappedSessions: ChatSession[] = data.map(s => ({
          id: String(s.id),
          title: s.title,
          createdAt: s.created_at,
          messages: []
        }));
        setSessions(mappedSessions);
        setActiveSessionId(mappedSessions[0].id);
      } else {
        createNewSession();
      }
    }).catch(e => {
      console.error("Lỗi khi tải session từ DB", e);
      // Fallback
      const initSession: ChatSession = {
        id: `sess-${Date.now()}`,
        title: "Cuộc trò chuyện mới",
        createdAt: new Date().toISOString(),
        messages: initialMessages()
      };
      setSessions([initSession]);
      setActiveSessionId(initSession.id);
    });
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      const active = sessions.find(s => s.id === activeSessionId);
      // Nếu session chưa có tin nhắn nào và chưa fetch (tránh infinite loop)
      if (active && active.messages.length === 0 && !active.id.startsWith("sess-") && !(active as any).hasFetched) {
        // Mark as fetching to prevent race condition
        setSessions(curr => curr.map(s => s.id === activeSessionId ? { ...s, hasFetched: true } : s));
        
        aiApi.getSessionMessages(activeSessionId).then((data: any[]) => {
           if (data && data.length > 0) {
             const messages: ChatMessage[] = data.map(m => ({
               id: String(m.id),
               role: m.sender,
               content: m.content
             }));
             setSessions(curr => curr.map(s => {
                if (s.id === activeSessionId && s.messages.length === 0) {
                   return { ...s, messages };
                }
                return s;
             }));
           }
        }).catch(console.error);
      }
    }
  }, [activeSessionId, sessions]);

  async function createNewSession() {
    const currentActive = sessions.find(s => s.id === activeSessionId);
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
        messages: initialMessages()
      };
      setSessions(curr => [newSession, ...curr]);
      setActiveSessionId(newSession.id);
      setView("chat");
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteSession(id: string) {
    if (!id.startsWith("sess-")) {
       await aiApi.clearSession(id).catch(console.error);
    }
    setSessions(curr => {
      const updated = curr.filter(s => s.id !== id);
      if (updated.length === 0) {
        createNewSession();
        return updated;
      }
      if (activeSessionId === id) {
        setActiveSessionId(updated[0].id);
      }
      return updated;
    });
  }

  function setMessages(updater: (current: ChatMessage[]) => ChatMessage[], overrideSessionId?: string) {
    setSessions(curr => {
      const targetId = overrideSessionId || activeSessionId;
      if (!targetId) return curr;
      return curr.map(session => {
        if (session.id === targetId) {
          const newMessages = updater(session.messages);
          let newTitle = session.title;
          if (newTitle === "Cuộc trò chuyện mới" && newMessages.length > 0) {
             const firstUserMsg = newMessages.find(m => m.role === "user");
             if (firstUserMsg) {
                const words = firstUserMsg.content.trim().split(/\s+/);
                newTitle = words.slice(0, 6).join(" ") + (words.length > 6 ? "..." : "");
                // Sync to DB (fire and forget)
                if (!targetId.startsWith("sess-")) {
                   aiApi.updateSession(targetId, newTitle).catch(console.error);
                }
             }
          }
          return { ...session, title: newTitle, messages: newMessages };
        }
        return session;
      });
    });
  }

  useEffect(() => {
    if (!isOpen || !messageStackRef.current) {
      return;
    }

    if (isAutoScrollEnabledRef.current) {
      const messageStack = messageStackRef.current;
      messageStack.scrollTop = messageStack.scrollHeight;
    }
  }, [isOpen, messages]);

  const handleScroll = () => {
    if (!messageStackRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messageStackRef.current;
    // Enable auto-scroll if user is within 100px of the bottom
    isAutoScrollEnabledRef.current = scrollHeight - scrollTop - clientHeight < 100;
  };



  function pushAssistantText(content: string) {
    const message = createAssistantMessage(content);
    isAutoScrollEnabledRef.current = true;
    setMessages((current) => [...current, message]);
  }

  async function submitPrompt(rawPrompt: string) {
    const cleanPrompt = rawPrompt.trim();
    if (!cleanPrompt || !activeSessionId) {
      return;
    }

    setIsOpen(true);
    setDraft("");

    const scopeProjectId = projectId || null;

    const loadingMessageId = `assistant-loading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    isAutoScrollEnabledRef.current = true;
    setIsLoading(true);
    
    const controller = new AbortController();
    setAbortController(controller);
    
    let targetSessionId = activeSessionId;
    let finalMessageId = `assistant-${Date.now()}`;

    try {
      if (targetSessionId.startsWith("sess-")) {
         const dbSession = await aiApi.createSession("Cuộc trò chuyện mới");
         targetSessionId = String(dbSession.id);
         setActiveSessionId(targetSessionId);
         setSessions(curr => curr.map(s => s.id === activeSessionId ? { ...s, id: targetSessionId } : s));
      }

      setMessages((current) => [...current, createUserMessage(cleanPrompt)], targetSessionId);
      
      setMessages((current) => [
        ...current,
        {
          id: loadingMessageId,
          role: "assistant",
          content: "",
        },
      ], targetSessionId);

      let response = await fetch(`${getApiBaseUrl()}${aiApi.streamChatUrl}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          session_id: targetSessionId,
          message: cleanPrompt,
          project_id: scopeProjectId ? Number(scopeProjectId) : null,
        }),
      });

      if (response.status === 401) {
        // Token có thể đã hết hạn, gọi 1 API axios bất kỳ để trigger auto-refresh
        await aiApi.classifyIntent({ action: null, prompt: "ping" }).catch(() => {});
        // Retry
        response = await fetch(`${getApiBaseUrl()}${aiApi.streamChatUrl}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            session_id: targetSessionId,
            message: cleanPrompt,
            project_id: scopeProjectId ? Number(scopeProjectId) : null,
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
          
          if (line.startsWith("data: ")) {
            const dataStr = line.substring(6);
            if (dataStr === "[DONE]") {
              continue;
            }
            try {
              const data = JSON.parse(dataStr);
              if (data.chunk) {
                toolCallStr = ""; // Clear tool text when real answer streams
                assistantContent += data.chunk;
                setMessages((current) =>
                  current.map((message) =>
                    message.id === loadingMessageId
                      ? { ...message, content: toolCallStr + assistantContent }
                      : message
                  )
                , targetSessionId);
              } else if (data.tool_call) {
                toolCallStr = `_[Đang gọi công cụ ${data.tool_call}...]_\n\n`;
                setMessages((current) =>
                  current.map((message) =>
                    message.id === loadingMessageId
                      ? { ...message, content: toolCallStr + assistantContent }
                      : message
                  )
                , targetSessionId);
              } else if (data.replace !== undefined) {
                toolCallStr = "";
                assistantContent = data.replace;
                setMessages((current) =>
                  current.map((message) =>
                    message.id === loadingMessageId
                      ? { ...message, content: assistantContent }
                      : message
                  )
                , targetSessionId);
              } else if (data.error) {
                assistantContent += `\n\n**Lỗi:** ${data.error}`;
                setMessages((current) =>
                  current.map((message) =>
                    message.id === loadingMessageId
                      ? { ...message, content: assistantContent }
                      : message
                  )
                , targetSessionId);
              } else if (data.new_session_id) {
                const newId = String(data.new_session_id);
                setSessions(curr => curr.map(s => s.id === targetSessionId ? { ...s, id: newId } : s));
                setActiveSessionId(curr => curr === targetSessionId ? newId : curr);
                targetSessionId = newId;
              } else if (data.message_id) {
                finalMessageId = String(data.message_id);
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete chunks (shouldn't happen with proper buffer)
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        return;
      }
      const errorMsg = error instanceof Error ? error.message : "Không thể kết nối với AI.";
      setMessages((current) =>
        current.map((message) =>
          message.id === loadingMessageId ? { ...message, content: errorMsg } : message
        ),
        targetSessionId
      );
    } finally {
      setAbortController(null);
      // Rename the ID to a permanent one from the server so it can be updated
      setMessages((current) =>
        current.map((message) =>
          message.id === loadingMessageId
            ? { ...message, id: finalMessageId }
            : message
        ),
        targetSessionId
      );
      setIsLoading(false);
    }
  }

  const panel = (
    <section
      className="assistant-panel"
      aria-label="Trợ lý AI"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="assistant-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e3a8a', fontSize: '1.2rem', fontWeight: '700' }}>
          <svg style={{width: 20, height: 20, fill: '#2563eb'}} viewBox="0 0 24 24"><path d="M12 2 15 9l7 3-7 3-3 7-3-7-7-3 7-3z"/></svg>
          AI Assistant
        </div>
        <div className="assistant-header-actions">
          {view === "history" ? (
            <button type="button" className="assistant-action-btn" onClick={() => setView("chat")}>
              Quay lại
            </button>
          ) : (
            <>
              <button type="button" className="assistant-icon-btn assistant-icon-primary" onClick={createNewSession} title="Cuộc trò chuyện mới">
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect width="24" height="24" rx="6"/><path d="M12 7v10M7 12h10" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
              <button type="button" className="assistant-icon-btn assistant-icon-secondary" onClick={() => setView("history")} title="Lịch sử">
                <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              </button>
            </>
          )}
          <button
            type="button"
            className="assistant-icon-btn assistant-icon-secondary"
            aria-label="Đóng trợ lý AI"
            onClick={() => setIsOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </header>

      {view === "history" ? (
        <div className="assistant-history-view">
          <div className="assistant-history-list">
            {sessions.map(session => (
              <div 
                key={session.id} 
                className={classNames("assistant-history-item", session.id === activeSessionId && "active")}
                onClick={() => { setActiveSessionId(session.id); setView("chat"); }}
              >
                <div className="assistant-history-info">
                  <strong>{session.title}</strong>
                  <small>{formatGeneratedAt(session.createdAt)}</small>
                </div>
                <button 
                  type="button" 
                  className="assistant-history-delete"
                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id); aiApi.clearSession(session.id); }}
                >
                  Xóa
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>



      <div ref={messageStackRef} className="assistant-message-stack" onScroll={handleScroll}>
        {messages.map((message) => (
          <article
            key={message.id}
            data-message-id={message.id}
            className={classNames(
              "assistant-message",
              message.role === "assistant"
                ? "assistant-message-assistant"
                : "assistant-message-user",
            )}
          >
            <span className="assistant-message-sender">{message.role === "assistant" ? "AI" : "Bạn"}</span>

            <div className="assistant-message-content">
              <MemoizedMarkdown content={message.content} messageId={message.id} projectId={projectId} />
              {isLoading && message.id.startsWith("assistant-loading") && (
                <span className="typing-dots"><span>.</span><span>.</span><span>.</span></span>
              )}
            </div>
          </article>
        ))}
      </div>



      <form
        className="assistant-compose"
        onSubmit={(event) => {
          event.preventDefault();
          if (isLoading) return;
          void submitPrompt(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask me anything..."
        />
        {isLoading ? (
          <button
            type="button"
            className="assistant-send-btn"
            onClick={() => abortController?.abort()}
            title="Dừng AI"
          >
             <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" fill="#ef4444" stroke="none" rx="1" ry="1"></rect></svg>
          </button>
        ) : (
          <button type="submit" className="assistant-send-btn">
             <svg viewBox="0 0 24 24" fill="#2563eb" stroke="none"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
          </button>
        )}
      </form>
      </>
      )}
    </section>
  );

  const widget = (
    <>
      {isOpen ? (
        <div
          className="assistant-overlay"
          onClick={() => setIsOpen(false)}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="assistant-panel-shell">{panel}</div>
        </div>
      ) : null}

      <div className={classNames("assistant-widget", isOpen && "assistant-widget-open")}>
        <button
          type="button"
          className="assistant-fab"
          aria-expanded={isOpen}
          aria-label="Mở trợ lý AI"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="assistant-fab-ring" />
          <span className="assistant-fab-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 2 2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2Z" />
            </svg>
          </span>
          <span className="assistant-fab-badge">{alertCount}</span>
        </button>
      </div>
    </>
  );

  if (!isPortalReady) {
    return null;
  }

  return createPortal(widget, document.body);
}
