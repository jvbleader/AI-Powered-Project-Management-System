"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { aiApi, projectApi } from "@/services/api";
import type { AiQuickResponse, AiQuickResponseAction } from "@/types";

type SuggestedPrompt = {
  action: AiQuickResponseAction;
  prompt: string;
};

type PromptResolution =
  | {
      action: AiQuickResponseAction;
      taskId?: string | null;
    }
  | {
      helpText: string;
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
    prompt: "Hom nay toi nen chu y viec gi truoc?",
  },
  {
    action: "stalled_tasks",
    prompt: "Task nao dang dung yen?",
  },
  {
    action: "critical_overdue",
    prompt: "Task nao dang tre han dang lo nhat?",
  },
  {
    action: "follow_up_members",
    prompt: "Ai can duoc nhac hom nay?",
  },
  {
    action: "leader_brief",
    prompt: "Viet cho toi 4 dong cap nhat de bao leader.",
  },
];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatGeneratedAt(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "Moi cap nhat";
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

function resolvePrompt(prompt: string): PromptResolution {
  const normalized = normalizePrompt(prompt);
  const taskId = extractTaskId(normalized);

  if (taskId) {
    return {
      action: "task_health",
      taskId,
    };
  }

  if (
    normalized.includes("nhac ai") ||
    normalized.includes("ai can nhac") ||
    normalized.includes("follow up") ||
    normalized.includes("theo ai")
  ) {
    return { action: "follow_up_members" };
  }

  if (
    normalized.includes("tre han") ||
    normalized.includes("qua han") ||
    normalized.includes("dang lo nhat")
  ) {
    return { action: "critical_overdue" };
  }

  if (
    normalized.includes("dung yen") ||
    normalized.includes("khong cap nhat") ||
    normalized.includes("canh bao som")
  ) {
    return { action: "stalled_tasks" };
  }

  if (
    (normalized.includes("tom tat") ||
      normalized.includes("bao leader") ||
      normalized.includes("gui leader") ||
      normalized.includes("cap nhat leader")) &&
    (normalized.includes("leader") ||
      normalized.includes("quan ly") ||
      normalized.includes("cap nhat"))
  ) {
    return { action: "leader_brief" };
  }

  if (
    normalized.includes("hom nay") &&
    (normalized.includes("chu y") ||
      normalized.includes("theo sat") ||
      normalized.includes("uu tien") ||
      normalized.includes("tap trung") ||
      normalized.includes("lam gi truoc"))
  ) {
    return { action: "daily_priority" };
  }

  if (
    normalized.includes("uu tien") ||
    normalized.includes("theo sat") ||
    normalized.includes("viec gi truoc")
  ) {
    return { action: "daily_priority" };
  }

  if (normalized.includes("task")) {
    return {
      helpText:
        "Neu ban muon kiem tra nhanh mot task cu the, hay ghi ro ma nhu TASK-104 de toi tra loi dung task.",
    };
  }

  return {
    helpText:
      "Hien tai toi dang ho tro cac cau hoi ve viec can theo sat, task dung yen, task tre han, follow-up thanh vien, va tom tat ngan cho leader.",
  };
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
      "Toi san sang ho tro nhanh du an cua ban. Ban co the hoi theo kieu chatbot, vi du: hom nay nen chu y viec gi, ai can nhac, hoac task nao dang tre han dang lo nhat.",
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
  const [fallbackProjectId, setFallbackProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages());
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messageStackRef = useRef<HTMLDivElement | null>(null);
  const scrollTargetMessageIdRef = useRef<string | null>(null);
  const resolvedProjectId = projectId ?? fallbackProjectId;

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

  async function resolveProjectScope() {
    if (projectId) {
      return projectId;
    }

    if (fallbackProjectId) {
      return fallbackProjectId;
    }

    const { data: projects } = await projectApi.list();
    const nextProjectId = projects[0]?.id ?? null;
    if (nextProjectId) {
      setFallbackProjectId(nextProjectId);
    }
    return nextProjectId;
  }

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

    const resolution = forcedAction
      ? ({ action: forcedAction } satisfies PromptResolution)
      : resolvePrompt(cleanPrompt);

    if ("helpText" in resolution) {
      pushAssistantText(resolution.helpText);
      return;
    }

    const loadingMessageId = `assistant-loading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    scrollTargetMessageIdRef.current = loadingMessageId;
    setIsLoading(true);
    setMessages((current) => [
      ...current,
      {
        id: loadingMessageId,
        role: "assistant",
        content: `Dang phan tich: ${cleanPrompt}`,
      },
    ]);

    try {
      const scopeProjectId = await resolveProjectScope();
      if (!scopeProjectId) {
        setMessages((current) =>
          current.map((message) =>
            message.id === loadingMessageId
              ? createAssistantMessage("Chua tim thay du an nao trong pham vi de phan tich.")
              : message,
          ),
        );
        return;
      }

      const { data } = await aiApi.quickResponse({
        action: resolution.action,
        projectId: scopeProjectId,
        taskId: resolution.taskId ?? null,
      });

      if (!projectId) {
        setFallbackProjectId(scopeProjectId);
      }

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
                  : "Khong the lay phan tich nhanh tu tro ly AI.",
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
      aria-label="Tro ly AI"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="assistant-panel-header">
        <div>
          <span className="eyebrow">Tro ly AI</span>
          <h2>Quick Response Chat</h2>
          <p>Hoi nhanh ve task, deadline, logwork va ai can duoc follow-up.</p>
        </div>
        <button
          type="button"
          className="assistant-close"
          aria-label="Dong tro ly AI"
          onClick={() => setIsOpen(false)}
        >
          ×
        </button>
      </header>

      <div className="assistant-memory-note">
        <strong>Scope hien tai</strong>
        <p className="assistant-scope-note">
          {resolvedProjectId
            ? `Dang phan tich project #${resolvedProjectId}.`
            : "Chua co project scope co dinh, he thong se dung du an dau tien trong pham vi."}
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
            <span>{message.role === "assistant" ? "AI" : "Ban"}</span>

            {message.response ? (
              <div className="assistant-message-content">
                <strong className="assistant-message-title">{message.response.title}</strong>
                <p>{message.response.summary}</p>

                {message.response.evidence.length ? (
                  <div className="assistant-detail-block">
                    <strong className="assistant-section-heading">Du kien</strong>
                    <ul className="assistant-detail-list">
                      {message.response.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {message.response.recommendations.length ? (
                  <div className="assistant-detail-block">
                    <strong className="assistant-section-heading">Goi y hanh dong</strong>
                    <ul className="assistant-detail-list">
                      {message.response.recommendations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {message.response.entities.length ? (
                  <div className="assistant-detail-block">
                    <strong className="assistant-section-heading">Lien quan</strong>
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
          placeholder="Dat cau hoi cho tro ly AI..."
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Dang xu ly..." : "Gui"}
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
          aria-label="Mo tro ly AI"
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
