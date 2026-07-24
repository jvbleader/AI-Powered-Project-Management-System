"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { aiApi, projectApi } from "@/services/api";
import type { AiQuickResponse, AiQuickResponseAction } from "@/types";

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
  return [
    createAssistantMessage(
      "Tôi sẵn sàng hỗ trợ nhanh dự án của bạn. Bạn có thể hỏi theo kiểu chatbot, ví dụ: hôm nay nên chú ý việc gì, ai cần nhắc, hoặc task nào đang trễ hạn đáng lo nhất.",
    ),
  ];
}

export function AssistantBubble({
  alertCount,
  projectId,
}: {
  alertCount: number;
  projectId?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPortalReady, setIsPortalReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages());
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messageStackRef = useRef<HTMLDivElement | null>(null);
  const scrollTargetMessageIdRef = useRef<string | null>(null);

  const promptChips = useMemo(() => suggestedPrompts.slice(0, 4), []);

  useEffect(() => {
    setIsPortalReady(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !messageStackRef.current) {
      return;
    }

    const messageStack = messageStackRef.current;
    const targetMessageId = scrollTargetMessageIdRef.current;

    if (!targetMessageId) {
      messageStack.scrollTop = messageStack.scrollHeight;
      return;
    }

    const targetMessage = messageStack.querySelector<HTMLElement>(
      `[data-message-id="${targetMessageId}"]`,
    );
    if (targetMessage) {
      messageStack.scrollTop = Math.max(
        0,
        targetMessage.offsetTop - messageStack.offsetTop,
      );
    }
  }, [isOpen, messages]);



  function pushAssistantText(content: string) {
    const message = createAssistantMessage(content);
    scrollTargetMessageIdRef.current = message.id;
    setMessages((current) => [...current, message]);
  }

  async function submitPrompt(rawPrompt: string, forcedAction?: AiQuickResponseAction) {
    const cleanPrompt = rawPrompt.trim();
    if (!cleanPrompt) {
      return;
    }

    setIsOpen(true);
    setDraft("");
    setMessages((current) => [...current, createUserMessage(cleanPrompt)]);

    const taskId = extractTaskId(cleanPrompt);
    const scopeProjectId = projectId || null;

    const loadingMessageId = `assistant-loading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    scrollTargetMessageIdRef.current = loadingMessageId;
    setIsLoading(true);
    setMessages((current) => [
      ...current,
      {
        id: loadingMessageId,
        role: "assistant",
        content: `Đang phân tích ý định...`,
      },
    ]);

    try {
      const classifyResponse = await aiApi.classifyIntent({
        action: forcedAction || null,
        prompt: cleanPrompt,
        projectId: scopeProjectId,
        taskId: taskId,
      });
      const intent = classifyResponse.intent;

      if (intent === "out_of_scope") {
        setMessages((current) =>
            current.map((message) =>
              message.id === loadingMessageId
                ? {
                    ...createAssistantMessage("Hệ thống này không hỗ trợ trả lời câu hỏi này.", {
                      action: "out_of_scope",
                      title: "Ngoài phạm vi hỗ trợ",
                      summary: "Hệ thống này không hỗ trợ trả lời câu hỏi này.",
                      evidence: [],
                      recommendations: [],
                      entities: [],
                      generatedAt: new Date().toISOString(),
                      dataFreshnessNote: ""
                    }),
                    id: loadingMessageId,
                  }
                : message,
          ),
        );
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === loadingMessageId
            ? {
                ...message,
                content: intent === "qna" ? "Đang đọc dữ liệu dự án..." : "Đang tính toán phân chia công việc...",
              }
            : message,
        ),
      );

      const { data } = await aiApi.executeAi({
        action: forcedAction || null,
        prompt: cleanPrompt,
        projectId: scopeProjectId,
        taskId: taskId,
        intent,
      });

      setMessages((current) =>
          current.map((message) =>
            message.id === loadingMessageId
              ? {
                  ...createAssistantMessage(data.summary, data),
                  id: loadingMessageId,
                }
              : message,
        ),
      );
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === loadingMessageId
            ? createAssistantMessage(
                error instanceof Error
                  ? error.message
                  : "Không thể lấy phân tích nhanh từ trợ lý AI.",
              )
            : message,
        ),
      );
    } finally {
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
        <div>
          <span className="eyebrow">Trợ lý AI</span>
          <h2>Quick Response Chat</h2>
          <p>Hỏi nhanh về task, deadline, logwork và ai cần được follow-up.</p>
        </div>
        <button
          type="button"
          className="assistant-close"
          aria-label="Đóng trợ lý AI"
          onClick={() => setIsOpen(false)}
        >
          ×
        </button>
      </header>

      <div className="assistant-memory-note">
        <strong>Scope hiện tại</strong>
        <p className="assistant-scope-note">
          {projectId
            ? `Đang tập trung phân tích dự án #${projectId}.`
            : "Đang phân tích tổng hợp trên TẤT CẢ các dự án bạn tham gia."}
        </p>
      </div>

      <div ref={messageStackRef} className="assistant-message-stack">
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
            <span>{message.role === "assistant" ? "AI" : "Bạn"}</span>

            {message.response ? (
              <div className="assistant-message-content">
                <strong className="assistant-message-title">{message.response.title}</strong>
                <p>{message.response.summary}</p>

                {message.response.evidence.length ? (
                  <div className="assistant-detail-block">
                    <strong className="assistant-section-heading">Dữ kiện</strong>
                    <ul className="assistant-detail-list">
                      {message.response.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {message.response.recommendations.length ? (
                  <div className="assistant-detail-block">
                    <strong className="assistant-section-heading">Gợi ý hành động</strong>
                    <ul className="assistant-detail-list">
                      {message.response.recommendations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {message.response.entities.length ? (
                  <div className="assistant-detail-block">
                    <strong className="assistant-section-heading">Liên quan</strong>
                    <div className="assistant-entity-row">
                      {message.response.entities.map((entity) => (
                        <span key={`${entity.type}-${entity.id}`} className="assistant-entity-chip">
                          <strong>{entity.label}</strong>
                          {entity.meta ? <small>{entity.meta}</small> : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <p className="assistant-data-note">
                  {message.response.dataFreshnessNote} · {formatGeneratedAt(message.response.generatedAt)}
                </p>
              </div>
            ) : (
              <p>{message.content}</p>
            )}
          </article>
        ))}
      </div>

      {messages.length === 1 ? (
        <div className="assistant-prompt-grid">
          {promptChips.map((item) => (
            <button
              key={item.prompt}
              type="button"
              className="assistant-prompt-chip"
              disabled={isLoading}
              onClick={() => void submitPrompt(item.prompt, item.action)}
            >
              {item.prompt}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="assistant-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void submitPrompt(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Đặt câu hỏi cho trợ lý AI..."
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Đang xử lý..." : "Gửi"}
        </button>
      </form>
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
