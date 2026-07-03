"use client";

import { useEffect, useState, useTransition } from "react";

import { aiApi } from "@/lib/api";
import type { AiMessage, AiWorkspaceBrief } from "@/types/dto";

type WidgetTab = "chat" | "reports";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AssistantBubble({ alertCount }: { alertCount: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WidgetTab>("chat");
  const [brief, setBrief] = useState<AiWorkspaceBrief | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen || brief) {
      return;
    }

    let isMounted = true;

    startTransition(async () => {
      const { data } = await aiApi.getWorkspaceBrief();

      if (!isMounted) {
        return;
      }

      setBrief(data);
      setMessages((current) => (current.length ? current : data.messages));
    });

    return () => {
      isMounted = false;
    };
  }, [brief, isOpen]);

  function askAssistant(prompt: string) {
    const cleanPrompt = prompt.trim();

    if (!cleanPrompt) {
      return;
    }

    setDraft("");
    setMessages((current) => [
      ...current,
      {
        id: `local-user-${Date.now()}`,
        role: "user",
        content: cleanPrompt,
      },
    ]);

    startTransition(async () => {
      const { data } = await aiApi.quickQuery(cleanPrompt);
      setMessages((current) => [...current, data]);
      setIsOpen(true);
      setActiveTab("chat");
    });
  }

  return (
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

      {isOpen ? (
        <section className="assistant-panel" aria-label="Trợ lý AI">
          <header className="assistant-panel-header">
            <div>
              <span className="eyebrow">Trợ lý AI</span>
              <h2>Hỗ trợ nhanh</h2>
              <p>Tra cứu số liệu, xem báo cáo tóm tắt và theo dõi trạng thái triển khai.</p>
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

          <div className="assistant-tabbar">
            <button
              type="button"
              className={classNames("assistant-tab", activeTab === "chat" && "assistant-tab-active")}
              onClick={() => setActiveTab("chat")}
            >
              Hội thoại
            </button>
            <button
              type="button"
              className={classNames("assistant-tab", activeTab === "reports" && "assistant-tab-active")}
              onClick={() => setActiveTab("reports")}
            >
              Báo cáo nhanh
            </button>
          </div>

          {activeTab === "chat" ? (
            <>
              <div className="assistant-message-stack">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={classNames(
                      "assistant-message",
                      message.role === "assistant"
                        ? "assistant-message-assistant"
                        : "assistant-message-user",
                    )}
                  >
                    <span>{message.role === "assistant" ? "AI" : "Bạn"}</span>
                    <p>{message.content}</p>
                  </article>
                ))}

                {!brief && isPending ? (
                  <article className="assistant-message assistant-message-assistant">
                    <span>AI</span>
                    <p>Đang khởi tạo ngữ cảnh trợ lý...</p>
                  </article>
                ) : null}
              </div>

              <div className="assistant-prompt-grid">
                {(brief?.prompts ?? []).slice(0, 3).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="assistant-prompt-chip"
                    onClick={() => askAssistant(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <form
                className="assistant-compose"
                onSubmit={(event) => {
                  event.preventDefault();
                  askAssistant(draft);
                }}
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Nhập câu hỏi cho trợ lý AI..."
                />
                <button type="submit" disabled={isPending}>
                  {isPending ? "Đang xử lý..." : "Gửi"}
                </button>
              </form>
            </>
          ) : (
            <div className="assistant-report-stack">
              {(brief?.reports ?? []).map((report) => (
                <article key={report.id} className="assistant-report-card">
                  <div className="assistant-report-topline">
                    <strong>{report.title}</strong>
                    <span>{report.metric}</span>
                  </div>
                  <p>{report.summary}</p>
                  <span className="assistant-report-tag">{report.chartLabel}</span>
                </article>
              ))}

              <div className="assistant-memory-note">
                <strong>Ngữ cảnh đang nạp</strong>
                <ul>
                  {(brief?.memoryModes ?? []).map((mode) => (
                    <li key={mode}>{mode}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
