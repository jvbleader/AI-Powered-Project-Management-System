"use client";

import { useEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";

import ReactMarkdown from "react-markdown";

import { TaskDraftConfirm } from "./task-draft-confirm";
import { SprintDraftConfirm } from "./sprint-draft-confirm";
import { SprintStatusDraftConfirm } from "./sprint-status-draft-confirm";
import { useAssistant } from "@/contexts/assistant-context";

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

const MemoizedMarkdown = memo(({ content, messageId, projectId, onDraftResolved }: { content: string, messageId: string, projectId?: string | null, onDraftResolved?: (messageId: string, status: "confirmed" | "rejected") => void }) => {
  const components = useMemo(() => ({
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-json_task_draft(?:_(confirmed|rejected))?/.exec(className || "");
      if (!inline && match) {
        const initialStatus = match[1] || "pending";
        return <TaskDraftConfirm draft={String(children)} projectId={projectId} messageId={messageId} initialStatus={initialStatus as any} onDraftResolved={onDraftResolved} />;
      }
      const sprintMatch = /language-json_sprint_draft(?:_(confirmed|rejected))?/.exec(className || "");
      if (!inline && sprintMatch) {
        const initialStatus = sprintMatch[1] || "pending";
        return <SprintDraftConfirm draft={String(children)} projectId={projectId} messageId={messageId} initialStatus={initialStatus as any} onDraftResolved={onDraftResolved} />;
      }
      const sprintStatusMatch = /language-json_sprint_status_draft(?:_(confirmed|rejected))?/.exec(className || "");
      if (!inline && sprintStatusMatch) {
        const initialStatus = sprintStatusMatch[1] || "pending";
        return <SprintStatusDraftConfirm draft={String(children)} messageId={messageId} initialStatus={initialStatus as any} onDraftResolved={onDraftResolved} />;
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
  }), [messageId, projectId, onDraftResolved]);

  return <ReactMarkdown components={components}>{content}</ReactMarkdown>;
});

export function AssistantBubble({
  projectId,
}: {
  projectId?: string | null;
}) {
  const {
    isOpen,
    setIsOpen,
    view,
    setView,
    sessions,
    activeSessionId,
    setActiveSessionId,
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
    resolveDraftMessage,
  } = useAssistant();

  const [isPortalReady, setIsPortalReady] = useState(false);
  const messageStackRef = useRef<HTMLDivElement | null>(null);
  const isAutoScrollEnabledRef = useRef<boolean>(true);

  useEffect(() => {
    setIsPortalReady(true);
  }, []);

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
    isAutoScrollEnabledRef.current = scrollHeight - scrollTop - clientHeight < 100;
  };

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
              <button type="button" className="assistant-icon-btn assistant-icon-primary" onClick={() => void createNewSession()} title="Cuộc trò chuyện mới">
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
                  <strong>
                    {session.title}
                    {streamingSessionIds.includes(session.id) ? (
                      <span style={{ marginLeft: 8, color: "#2563eb", fontWeight: 600, fontSize: "0.75rem" }}>
                        Đang trả lời...
                      </span>
                    ) : null}
                  </strong>
                  <small>{formatGeneratedAt(session.createdAt)}</small>
                </div>
                <button 
                  type="button" 
                  className="assistant-history-delete"
                  onClick={(e) => { e.stopPropagation(); void deleteSession(session.id); }}
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
              <MemoizedMarkdown
                content={message.content}
                messageId={message.id}
                projectId={projectId}
                onDraftResolved={resolveDraftMessage}
              />
              {isActiveStreaming && (message.id === activeLoadingMessageId || message.id.startsWith("assistant-loading")) && (
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
          if (isActiveStreaming) return;
          isAutoScrollEnabledRef.current = true;
          void submitPrompt(draft, projectId);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask me anything..."
        />
        {isActiveStreaming ? (
          <button
            type="button"
            className="assistant-send-btn"
            onClick={() => pauseSession(activeSessionId)}
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
        </button>
      </div>
    </>
  );

  if (!isPortalReady) {
    return null;
  }

  return createPortal(widget, document.body);
}
