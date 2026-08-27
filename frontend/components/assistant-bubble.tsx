"use client";

import { useEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";

import ReactMarkdown from "react-markdown";

import { TaskDraftConfirm } from "./task-draft-confirm";
import { SprintDraftConfirm } from "./sprint-draft-confirm";
import { SprintStatusDraftConfirm } from "./sprint-status-draft-confirm";
import { useRouter } from "next/navigation";
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

const DRAFT_FENCE_NAME_PATTERN =
  "json_task_draft(?:_confirmed|_rejected)?|json_sprint_draft(?:_confirmed|_rejected)?|json_sprint_status_draft(?:_confirmed|_rejected)?";

function normalizeDraftFenceLayout(content: string) {
  let normalized = content.replace(
    new RegExp(`([^\\n])(\\\`\\\`\\\`(?:${DRAFT_FENCE_NAME_PATTERN}))`, "g"),
    "$1\n\n$2",
  );

  normalized = normalized.replace(
    new RegExp(`\\\`\\\`\\\`(${DRAFT_FENCE_NAME_PATTERN})[ \\t]*(?=[\\[{])`, "g"),
    "```$1\n",
  );

  return normalized;
}

function hideIncompleteDraftContent(content: string, isStreaming: boolean) {
  const draftRegex = new RegExp(`\\\`\\\`\\\`(${DRAFT_FENCE_NAME_PATTERN})([\\s\\S]*)$`);
  const match = content.match(draftRegex);
  if (match && !match[2].includes("```")) {
    const placeholder = isStreaming ? "![draft-loading]()" : "![draft-error]()";
    return `${content.substring(0, match.index).trimEnd()}\n\n${placeholder}`;
  }
  return content;
}

function attachDraftIdsToFences(
  content: string,
  drafts?: Array<{ id: number; block_index: number }>,
) {
  if (!drafts?.length) return content;
  let blockIndex = 0;
  return content.replace(new RegExp(`\\\`\\\`\\\`(${DRAFT_FENCE_NAME_PATTERN})`, "g"), (match, fence) => {
    const draft = drafts.find((item) => item.block_index === blockIndex++);
    return draft ? `\`\`\`${fence}__draft_${draft.id}` : match;
  });
}

function autoLinkTaskIds(content: string, defaultProjectId?: string | null) {
  const projParam = defaultProjectId
    ? defaultProjectId.startsWith("prj-")
      ? defaultProjectId
      : `prj-${defaultProjectId}`
    : null;
  const baseHref = projParam ? `/projects/${projParam}` : "/tasks";

  const taskHref = (taskId: string) =>
    `${baseHref}?highlightTaskId=task-${taskId}&highlightColor=yellow`;

  const protectedSegments: string[] = [];
  const withLegacyTaskLinks = content.replace(
    /(\*\*\[ID:\s*(\d+)\]\s*([^\*\n\r]+?)\*\*)/g,
    (match, full, taskId, title) => {
      if (match.includes("](") || match.includes("[[ID:")) {
        return match;
      }
      const token = `\u0000TASK_LINK_${protectedSegments.length}\u0000`;
      protectedSegments.push(`**[[ID: ${taskId}] ${title.trim()}](${taskHref(taskId)})**`);
      return token;
    },
  );

  // Keep code spans and existing Markdown links intact before linking the
  // common task formats emitted by the assistant (TASK-123 and ID: 123).
  // The regex uses (?:[^\[\]]|\[[^\]]*\])* to allow exactly one level of nested brackets in the link text.
  const safeContent = withLegacyTaskLinks.replace(
    /`[^`]*`|!?\[(?:[^\[\]]|\[[^\]]*\])*\]\([^\)]+\)/g,
    (segment) => {
      const token = `\u0000TASK_LINK_${protectedSegments.length}\u0000`;
      protectedSegments.push(segment);
      return token;
    },
  );

  const linkedContent = safeContent.replace(
    /\b(?:TASK\s*[-#]\s*|ID\s*:\s*)(\d+)\b/gi,
    (label, taskId) => `[${label}](${taskHref(taskId)})`,
  );

  return linkedContent.replace(/\u0000TASK_LINK_(\d+)\u0000/g, (_token, index) =>
    protectedSegments[Number(index)],
  );
}

function extractRawText(node: any): string {
  if (!node) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractRawText).join("");
  if (typeof node === "object" && node.props?.children) {
    return extractRawText(node.props.children);
  }
  return "";
}

function extractMemberNameFromNode(node: any): string | null {
  if (!node) return null;
  if (typeof node === "string") {
    const match = node.match(/^(?:[\d\.\s\-\*]+)?([A-ZÀ-Ỹa-zà-ỹ\s]+?)(?:\s*-\s*|\s*\(|$)/);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
    return null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const name = extractMemberNameFromNode(item);
      if (name) return name;
    }
    return null;
  }
  if (typeof node === "object" && node !== null) {
    if (node.type === "strong" || node.props?.className?.includes("assistant-strong-label")) {
      const inner = extractRawText(node.props?.children);
      if (inner.trim()) return inner.trim();
    }
    if (node.props?.children) {
      return extractMemberNameFromNode(node.props.children);
    }
  }
  return null;
}

const MemoizedMarkdown = memo(({ content, messageId, projectId, drafts, isStreaming, onDraftResolved }: { content: string, messageId: string, projectId?: string | null, drafts?: Array<{ id: number; fence: string; block_index: number; payload: string; status: "pending" | "confirmed" | "rejected" }>, isStreaming: boolean, onDraftResolved?: (messageId: string, status: "confirmed" | "rejected") => void }) => {
  const router = useRouter();
  const { submitPrompt, isActiveStreaming } = useAssistant();
  const [selectedMemberName, setSelectedMemberName] = useState<string | null>(null);
  const linkedContent = useMemo(() => autoLinkTaskIds(content, projectId), [content, projectId]);
  const displayContent = attachDraftIdsToFences(
    hideIncompleteDraftContent(normalizeDraftFenceLayout(linkedContent), isStreaming),
    drafts,
  );

  const isMemberChoiceList = useMemo(
    () => /trùng\s+tên|thành\s+viên\s+có\s+tên|chỉ\s+định\s+rõ\s+họ\s+tên|chọn\s+nhân\s+sự|danh\s+sách\s+(?:các\s+)?thành\s+viên/i.test(content),
    [content],
  );

  const components = useMemo(() => ({
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-json_task_draft(?:__draft_(\d+)|_(confirmed|rejected))?/.exec(className || "");
      if (!inline && match) {
        const item = drafts?.find((draft) => draft.id === Number(match[1]));
        return <TaskDraftConfirm draft={item?.payload || String(children)} projectId={projectId} messageId={item ? String(item.id) : ""} initialStatus={(item?.status || match[2] || "pending") as any} onDraftResolved={onDraftResolved} />;
      }
      const sprintMatch = /language-json_sprint_draft(?:__draft_(\d+)|_(confirmed|rejected))?/.exec(className || "");
      if (!inline && sprintMatch) {
        const item = drafts?.find((draft) => draft.id === Number(sprintMatch[1]));
        return <SprintDraftConfirm draft={item?.payload || String(children)} projectId={item ? String(item.id) : ""} initialStatus={(item?.status || sprintMatch[2] || "pending") as any} onDraftResolved={onDraftResolved} />;
      }
      const sprintStatusMatch = /language-json_sprint_status_draft(?:__draft_(\d+)|_(confirmed|rejected))?/.exec(className || "");
      if (!inline && sprintStatusMatch) {
        const item = drafts?.find((draft) => draft.id === Number(sprintStatusMatch[1]));
        return <SprintStatusDraftConfirm draft={item?.payload || String(children)} messageId={item ? String(item.id) : ""} initialStatus={(item?.status || sprintStatusMatch[2] || "pending") as any} onDraftResolved={onDraftResolved} />;
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    h1({ children, ...props }: any) {
      return <h1 className="assistant-content-h1" {...props}>{children}</h1>;
    },
    h2({ children, ...props }: any) {
      return <h2 className="assistant-content-h2" {...props}>{children}</h2>;
    },
    h3({ children, ...props }: any) {
      return (
        <h3 className="assistant-content-h3" {...props}>
          <span className="assistant-h3-indicator" />
          {children}
        </h3>
      );
    },
    h4({ children, ...props }: any) {
      return <h4 className="assistant-content-h4" {...props}>{children}</h4>;
    },
    ol({ children, ...props }: any) {
      return (
        <ol className="assistant-task-card-list" {...props}>
          {children}
        </ol>
      );
    },
    ul({ children, ...props }: any) {
      return (
        <ul className="assistant-attribute-list" {...props}>
          {children}
        </ul>
      );
    },
    li({ children, ...props }: any) {
      const rawText = extractRawText(children);
      const isCandidateItem = isMemberChoiceList || (rawText.includes("@") && rawText.includes("-"));
      const memberName = isCandidateItem ? extractMemberNameFromNode(children) : null;
      if (memberName) {
        const isSelected = selectedMemberName === memberName;
        const isDisabled = Boolean(selectedMemberName) || isActiveStreaming;
        return (
          <li
            className={classNames(
              "assistant-list-item assistant-member-choice-item",
              isSelected && "assistant-member-choice-item--selected",
              isDisabled && !isSelected && "assistant-member-choice-item--disabled",
            )}
            onClick={() => {
              if (isDisabled) return;
              setSelectedMemberName(memberName);
              void submitPrompt(`Giao cho ${memberName}`, projectId);
            }}
            title={isSelected ? `Đã chọn ${memberName}` : `Chọn giao cho ${memberName}`}
            {...props}
          >
            <div className="assistant-member-choice-content">
              <div className="assistant-member-choice-text">
                {children}
              </div>
            </div>
          </li>
        );
      }
      return (
        <li className="assistant-list-item" {...props}>
          {children}
        </li>
      );
    },
    p({ children, ...props }: any) {
      return (
        <p className="assistant-content-p" {...props}>
          {children}
        </p>
      );
    },
    strong({ children, ...props }: any) {
      return (
        <strong className="assistant-strong-label" {...props}>
          {children}
        </strong>
      );
    },
    a({ href, children, ...props }: any) {
      const handleClick = (e: React.MouseEvent) => {
        if (!href) return;

        if (
          href.startsWith("/") ||
          href.startsWith("#") ||
          href.includes("taskId=") ||
          href.includes("highlightTaskId=")
        ) {
          e.preventDefault();

          try {
            const url = new URL(href, window.location.origin);
            const queryHighlightId =
              url.searchParams.get("highlightTaskId") || url.searchParams.get("taskId");
            const pathParts = url.pathname.split("/");
            const pathProjectId = pathParts[2];

            if (queryHighlightId) {
              const normalizedTaskId = queryHighlightId.startsWith("task-")
                ? queryHighlightId
                : `task-${queryHighlightId}`;

              window.dispatchEvent(
                new CustomEvent("flowpilot-highlight-task", {
                  detail: {
                    taskId: normalizedTaskId,
                    projectId: pathProjectId || projectId,
                  },
                }),
              );

              const currentUrl = new URL(window.location.href);
              if (currentUrl.pathname === url.pathname) {
                const newParams = new URLSearchParams(window.location.search);
                newParams.set("highlightTaskId", normalizedTaskId);
                newParams.set("highlightColor", "yellow");

                router.replace(`${url.pathname}?${newParams.toString()}`, { scroll: false });
                return;
              }
            }

            router.push(href);
          } catch {
            router.push(href);
          }
        }
      };

      return (
        <a
          href={href}
          onClick={handleClick}
          className="assistant-task-link"
          title="Bấm để chuyển hướng đến vị trí của task trên dự án"
          {...props}
        >
          <span className="assistant-task-link-text">{children}</span>
          <svg
            className="assistant-task-link-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      );
    },
    img({ node, className, src, alt, ...props }: any) {
      if (alt === "draft-loading") {
        return (
          <span style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", margin: "16px 0", backgroundColor: "#f0fdf4", borderRadius: "12px", color: "#166534", border: "1px solid #bbf7d0", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
              </path>
            </svg>
            <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "14px", fontWeight: 600 }}>Đang phân rã công việc và thiết kế bản nháp</span>
              <span style={{ fontSize: "12px", color: "#15803d", opacity: 0.9 }}>AI đang xử lý dữ liệu và kiểm tra ràng buộc, vui lòng chờ...</span>
            </span>
          </span>
        );
      }
      if (alt === "draft-error") {
        return (
          <span style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", margin: "16px 0", backgroundColor: "#fef2f2", borderRadius: "12px", color: "#991b1b", border: "1px solid #fecaca" }}>
            Phản hồi đã kết thúc trước khi bản nháp hoàn chỉnh. Vui lòng gửi lại yêu cầu để tạo bản nháp mới.
          </span>
        );
      }
      return <img className={className} src={src} alt={alt} {...props} />;
    }
  }), [
    router,
    messageId,
    projectId,
    drafts,
    onDraftResolved,
    isActiveStreaming,
    isMemberChoiceList,
    selectedMemberName,
    submitPrompt,
  ]);

  return <ReactMarkdown components={components}>{displayContent}</ReactMarkdown>;
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
  const [sessionPendingDelete, setSessionPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  const confirmDeleteSession = async () => {
    if (!sessionPendingDelete) return;
    setIsDeletingSession(true);
    setDeleteError(null);
    const deleted = await deleteSession(sessionPendingDelete.id);
    setIsDeletingSession(false);
    if (deleted) {
      setSessionPendingDelete(null);
      return;
    }
    setDeleteError("Không thể xóa cuộc trò chuyện. Vui lòng thử lại.");
  };

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
          <svg style={{ width: 20, height: 20, fill: '#2563eb' }} viewBox="0 0 24 24"><path d="M12 2 15 9l7 3-7 3-3 7-3-7-7-3 7-3z" /></svg>
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
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect width="24" height="24" rx="6" /><path d="M12 7v10M7 12h10" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" /></svg>
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteError(null);
                    setSessionPendingDelete({ id: session.id, title: session.title });
                  }}
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
                    drafts={message.drafts}
                    isStreaming={isActiveStreaming && (message.id === activeLoadingMessageId || message.id.startsWith("assistant-loading"))}
                    onDraftResolved={resolveDraftMessage}
                  />
                  {isActiveStreaming && (message.id === activeLoadingMessageId || message.id.startsWith("assistant-loading")) && (
                    <span className="typing-dots"><span>.</span><span>.</span><span>.</span></span>
                  )}
                  {message.isError && message.retryPrompt ? (
                    <button
                      type="button"
                      className="assistant-retry-btn"
                      disabled={isActiveStreaming}
                      onClick={() => void submitPrompt(message.retryPrompt!, message.retryProjectId ?? projectId)}
                    >
                      Thử lại
                    </button>
                  ) : null}
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
                <svg viewBox="0 0 24 24" fill="#2563eb" stroke="none"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>
              </button>
            )}
          </form>
        </>
      )}
    </section>
  );

  const widget = (
    <>
      {sessionPendingDelete ? (
        <div className="assistant-confirm-backdrop" role="presentation">
          <section className="assistant-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="assistant-delete-title">
            <h2 id="assistant-delete-title">Xóa cuộc trò chuyện?</h2>
            <p>Toàn bộ lịch sử và bản nháp trong “{sessionPendingDelete.title}” sẽ bị xóa.</p>
            {deleteError ? <p className="assistant-confirm-error" role="alert">{deleteError}</p> : null}
            <div className="assistant-confirm-actions">
              <button type="button" onClick={() => setSessionPendingDelete(null)} disabled={isDeletingSession}>
                Hủy
              </button>
              <button type="button" className="assistant-confirm-delete" onClick={() => void confirmDeleteSession()} disabled={isDeletingSession}>
                {isDeletingSession ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
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
