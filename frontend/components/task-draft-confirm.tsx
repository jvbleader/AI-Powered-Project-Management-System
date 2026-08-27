"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { aiApi, projectApi } from "@/services/api";
import { AssigneeSelect } from "@/components/assignee-select";
import { CustomSelect } from "@/components/custom-select";
import ReactMarkdown from "react-markdown";
import {
  normalizeTaskPriority,
  taskPriorityLabel,
  taskPriorityPillStyle,
} from "@/lib/utils/format";
import { isPersistedMessageId } from "@/lib/assistant-storage";
import type { UserProfile } from "@/types";
import type { ProjectMemberResponse } from "@/services/api/projects";

type TaskDraft = {
  title: string;
  description?: string | Record<string, unknown>;
  priority?: "low" | "medium" | "high" | "critical";
  status?: "todo" | "in_progress" | "done";
  project_id?: number;
  parent_task_id?: number;
  parent_task_title?: string;
  assignee_id?: number;
  assignee_ids?: number[];
  assignee_name?: string;
  start_date?: string;
  deadline?: string;
  estimated_hours?: number;
  subtasks?: TaskDraft[];
};

function memberToUserProfile(member: ProjectMemberResponse): UserProfile {
  const name = member.userName || member.userEmail || "Người dùng";
  return {
    id: `usr-${member.userId}`,
    name,
    email: member.userEmail || "",
    role: member.roleName || "",
    title: member.roleName || "Thành viên dự án",
    initials: name.slice(0, 2).toUpperCase(),
    presence: member.isActive ? "online" : "offline",
    capacityHours: 40,
    workloadHours: 0,
    focusScore: 75,
    isActive: member.isActive,
  };
}

function formatDraftAssigneeNames(
  task: TaskDraft,
  members: ProjectMemberResponse[] = [],
): string {
  const children = task.subtasks || [];
  if (children.length > 0) {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const child of children) {
      for (const name of formatDraftAssigneeNames(child, members).split(", ")) {
        const trimmed = name.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        names.push(trimmed);
      }
    }
    return names.join(", ");
  }

  if (task.assignee_name?.trim()) return task.assignee_name.trim();
  const ids = [
    ...(Array.isArray(task.assignee_ids) ? task.assignee_ids : []),
    ...(task.assignee_id ? [task.assignee_id] : []),
  ];
  const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  const names = uniqueIds
    .map((id) => members.find((member) => member.userId === id)?.userName)
    .filter((name): name is string => Boolean(name?.trim()));
  return names.join(", ");
}

function formatStructuredDescription(desc: Record<string, unknown>): string {
  const mapping: Array<[string, string]> = [
    ["objective", "**1. Mục tiêu:**"],
    ["criteria", "**2. Tiêu chí / ràng buộc:**"],
    ["implementation", "**3. Cách làm:**"],
    ["output", "**4. Đầu ra:**"],
    ["acceptance_criteria", "**5. Tiêu chí chấp nhận:**"],
    ["acceptance", "**5. Tiêu chí chấp nhận:**"],
  ];
  const parts: string[] = [];
  for (const [key, label] of mapping) {
    if (key === "acceptance" && desc.acceptance_criteria) continue;
    const value = desc[key];
    if (value == null || value === "") continue;

    let text = Array.isArray(value)
      ? value.map((item) => `- ${String(item).trim()}`).join("\n")
      : String(value).trim();

    text = text.replace(/\n{2,}/g, "\n");
    text = text.replace(/^[ \t]+([-*]|\d+\.)\s/gm, "$1 ");

    if (text.match(/^[-*]\s/) || text.match(/^\d+\.\s/) || text.includes("\n")) {
      parts.push(`${label}\n${text}`);
    } else {
      parts.push(`${label} ${text}`);
    }
  }
  return parts.join("\n\n");
}

const DESCRIPTION_SECTIONS: Array<{ key: string; match: RegExp }> = [
  { key: "acceptance_criteria", match: /tiêu\s*chí\s*chấp\s*nhận|acceptance/i },
  { key: "objective", match: /mục\s*tiêu/i },
  { key: "criteria", match: /tiêu\s*chí|ràng\s*buộc|criteria/i },
  { key: "implementation", match: /cách\s*làm|implementation/i },
  { key: "output", match: /đầu\s*ra|output/i },
];

function parseStructuredDescription(markdown: string): Record<string, string | string[]> | null {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headingRe = /^\s*\*{0,2}\s*(\d+)\.\s*(.+?):\s*\*{0,2}\s*(.*)$/;
  const sections: Array<{ key: string; lines: string[] }> = [];
  let current: { key: string; lines: string[] } | null = null;

  for (const raw of lines) {
    const heading = raw.match(headingRe);
    let matchedKey: string | null = null;
    let rest = "";
    if (heading) {
      const rule = DESCRIPTION_SECTIONS.find((item) => item.match.test(heading[2].trim()));
      if (rule) {
        matchedKey = rule.key;
        rest = heading[3].trim();
      }
    }
    if (matchedKey) {
      current = { key: matchedKey, lines: rest ? [rest] : [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(raw);
  }

  if (sections.length < 2) return null;

  const result: Record<string, string | string[]> = {};
  for (const section of sections) {
    const body = section.lines.map((line) => line.trim()).filter(Boolean);
    const listItems = body
      .filter((line) => /^[-*]\s+/.test(line))
      .map((line) => line.replace(/^[-*]\s+/, "").trim())
      .filter(Boolean);
    if (listItems.length && (section.key === "acceptance_criteria" || listItems.length === body.length)) {
      result[section.key] = listItems;
    } else {
      result[section.key] = body.join("\n").trim();
    }
  }
  return result;
}

function descriptionForSave(
  original: TaskDraft["description"],
  editedMarkdown: string,
): TaskDraft["description"] {
  const parsed = parseStructuredDescription(editedMarkdown);
  if (parsed) {
    if (original && typeof original === "object") {
      return { ...(original as Record<string, unknown>), ...parsed };
    }
    return parsed;
  }
  const originalMarkdown = formatDraftDescription(original);
  if (originalMarkdown.replace(/\s+/g, " ").trim() === editedMarkdown.replace(/\s+/g, " ").trim()) {
    return original;
  }
  return editedMarkdown;
}

function formatDraftDescription(description: unknown): string {
  if (!description) return "";
  if (typeof description === "string") {
    const parsed = parseStructuredDescription(description);
    if (parsed) return formatStructuredDescription(parsed);
    return description;
  }
  if (typeof description !== "object") return String(description);
  return formatStructuredDescription(description as Record<string, unknown>);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function applyInlineMarkdown(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function draftMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${applyInlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) {
      continue;
    }
    html.push(`<div>${applyInlineMarkdown(line)}</div>`);
  }
  closeList();
  return html.join("");
}

function placeCaretIn(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const first = element.firstChild;
  if (first?.nodeName === "BR") {
    range.setStartBefore(first);
  } else if (first?.nodeType === Node.TEXT_NODE) {
    range.setStart(first, 0);
  } else {
    range.selectNodeContents(element);
    range.collapse(true);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function closestInEditor(node: Node | null, root: HTMLElement, tags: string[]): HTMLElement | null {
  let current: Node | null = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (current && current instanceof HTMLElement && current !== root) {
    if (tags.includes(current.tagName)) return current;
    current = current.parentElement;
  }
  return null;
}

function getEditableBlock(node: Node | null, root: HTMLElement): HTMLElement | null {
  return closestInEditor(node, root, ["LI"]) || closestInEditor(node, root, ["DIV", "P"]);
}

function isEmptyBlock(element: HTMLElement): boolean {
  return !(element.textContent || "").replace(/[\u00a0\u200b]/g, " ").trim();
}

function nodeToPlainLines(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return "\n";
  const inner = Array.from(node.childNodes).map(nodeToPlainLines).join("");
  if (["DIV", "P", "LI", "UL", "OL"].includes(node.tagName)) return `${inner}\n`;
  return inner;
}

function lineTextBeforeCaret(container: HTMLElement, range: Range): string {
  const pre = document.createRange();
  try {
    pre.selectNodeContents(container);
    pre.setEnd(range.startContainer, range.startOffset);
  } catch {
    return "";
  }
  const raw = Array.from(pre.cloneContents().childNodes).map(nodeToPlainLines).join("");
  const parts = raw.replace(/\n$/, "").split("\n");
  return (parts[parts.length - 1] || "").replace(/\u00a0/g, " ");
}

function findLastBrBeforeCaret(block: HTMLElement, range: Range): HTMLBRElement | null {
  let lastBr: HTMLBRElement | null = null;
  for (const br of Array.from(block.querySelectorAll("br"))) {
    const brRange = document.createRange();
    brRange.selectNode(br);
    try {
      if (brRange.compareBoundaryPoints(Range.START_TO_END, range) <= 0) {
        lastBr = br;
      }
    } catch {
      /* ignore */
    }
  }
  return lastBr;
}

function makeEmptyBulletList() {
  const li = document.createElement("li");
  li.appendChild(document.createElement("br"));
  const ul = document.createElement("ul");
  ul.appendChild(li);
  return { ul, li };
}

function convertDashLineToBullet(root: HTMLElement, requireSpace = false): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !range.collapsed) return false;

  if (closestInEditor(range.startContainer, root, ["LI"])) return false;
  const block = getEditableBlock(range.startContainer, root);

  const container = block || root;
  const line = lineTextBeforeCaret(container, range);
  const marker = requireSpace ? line.match(/^([-*])\s+$/) : line.match(/^([-*])\s*$/);
  if (!marker) return false;

  const { ul, li } = makeEmptyBulletList();

  if (!block) {
    const last = root.lastChild;
    if (last?.nodeType === Node.TEXT_NODE && /^[-*]\s*$/.test((last.textContent || "").replace(/\u00a0/g, " "))) {
      last.remove();
    } else {
      root.textContent = "";
    }
    root.appendChild(ul);
    placeCaretIn(li);
    return true;
  }

  const blockText = (block.textContent || "").replace(/\u00a0/g, " ").trim();
  if (blockText === "-" || blockText === "*") {
    block.replaceWith(ul);
    placeCaretIn(li);
    return true;
  }

  const lastBr = findLastBrBeforeCaret(block, range);
  if (lastBr) {
    let node: Node | null = lastBr.nextSibling;
    while (node) {
      const next = node.nextSibling;
      node.parentNode?.removeChild(node);
      node = next;
    }
    lastBr.remove();
    block.after(ul);
    placeCaretIn(li);
    return true;
  }

  const startNode = range.startContainer;
  if (startNode.nodeType === Node.TEXT_NODE) {
    const text = startNode.textContent || "";
    const before = text.slice(0, range.startOffset).replace(/[-*]\s*$/, "");
    const after = text.slice(range.startOffset);
    const newlineAt = before.lastIndexOf("\n");
    if (newlineAt >= 0) {
      startNode.textContent = `${before.slice(0, newlineAt)}${after}`;
      block.after(ul);
      placeCaretIn(li);
      return true;
    }
  }

  return false;
}

function exitListItem(li: HTMLElement) {
  const list = li.parentElement;
  const next = document.createElement("div");
  next.appendChild(document.createElement("br"));

  if (!list || (list.tagName !== "UL" && list.tagName !== "OL")) {
    li.replaceWith(next);
    placeCaretIn(next);
    return;
  }

  const following: Element[] = [];
  let sibling = li.nextElementSibling;
  while (sibling) {
    const nextSibling = sibling.nextElementSibling;
    following.push(sibling);
    sibling = nextSibling;
  }

  li.remove();
  list.after(next);

  if (following.length) {
    const rest = document.createElement(list.tagName);
    following.forEach((item) => rest.appendChild(item));
    next.after(rest);
  }
  if (!list.children.length) list.remove();
  placeCaretIn(next);
}

let listEnterLock = false;

function handleDescriptionEnter(root: HTMLElement): boolean {
  if (listEnterLock) return true;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const li = closestInEditor(selection.anchorNode, root, ["LI"]);
  if (!li) return false;

  listEnterLock = true;
  try {
    if (isEmptyBlock(li)) {
      exitListItem(li);
      return true;
    }

    const nextItem = document.createElement("li");
    nextItem.appendChild(document.createElement("br"));
    li.after(nextItem);
    placeCaretIn(nextItem);

    const list = nextItem.parentElement;
    requestAnimationFrame(() => {
      if (!list) return;
      for (const child of Array.from(list.children)) {
        if (child === nextItem || !(child instanceof HTMLElement) || child.tagName !== "LI") continue;
        const adjacent = child.previousElementSibling === nextItem || child.nextElementSibling === nextItem;
        if (adjacent && isEmptyBlock(child)) child.remove();
      }
    });
    return true;
  } finally {
    requestAnimationFrame(() => {
      listEnterLock = false;
    });
  }
}

function htmlToDraftMarkdown(root: HTMLElement): string {
  const serializeInline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (!(node instanceof HTMLElement)) return "";
    const tag = node.tagName;
    if (tag === "BR") return "\n";
    if (tag === "STRONG" || tag === "B") {
      return `**${Array.from(node.childNodes).map(serializeInline).join("")}**`;
    }
    if (tag === "UL" || tag === "OL") return `\n${serializeBlock(node)}`;
    return Array.from(node.childNodes).map(serializeInline).join("");
  };

  const serializeBlock = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").trim();
    if (!(node instanceof HTMLElement)) return "";
    const tag = node.tagName;
    if (tag === "BR") return "";
    if (tag === "LI") {
      const nested = Array.from(node.children).filter(
        (child) => child.tagName === "UL" || child.tagName === "OL",
      );
      const inline = Array.from(node.childNodes)
        .filter((child) => !(child instanceof HTMLElement && (child.tagName === "UL" || child.tagName === "OL")))
        .map(serializeInline)
        .join("")
        .trim();
      const nestedText = nested.map(serializeBlock).filter(Boolean).join("\n");
      return nestedText ? `- ${inline}\n${nestedText}` : `- ${inline}`;
    }
    if (tag === "UL" || tag === "OL") {
      return Array.from(node.children).map(serializeBlock).filter(Boolean).join("\n");
    }
    return Array.from(node.childNodes).map(serializeInline).join("").trim();
  };

  return Array.from(root.childNodes)
    .map(serializeBlock)
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function replaceTaskAtPath(
  tasks: TaskDraft[],
  path: number[],
  replacement: TaskDraft,
): TaskDraft[] {
  const [index, ...rest] = path;
  return tasks.map((task, currentIndex) => {
    if (currentIndex !== index) return task;
    if (rest.length === 0) return replacement;
    return {
      ...task,
      subtasks: replaceTaskAtPath(task.subtasks || [], rest, replacement),
    };
  });
}

function parseDraftEstimatedHours(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundDraftEstimatedHours(value: number): number {
  return Math.round(value * 10) / 10;
}

function isDraftTaskRejected(path: number[], rejectedPaths: Set<string>): boolean {
  return path.some((_, index) => rejectedPaths.has(path.slice(0, index + 1).join("-")));
}

function syncDraftTaskRollups(tasks: TaskDraft[]): TaskDraft[] {
  return tasks.map((task) => {
    const nextTask = { ...task };
    const children = task.subtasks || [];
    if (children.length > 0) {
      nextTask.subtasks = syncDraftTaskRollups(children);
      nextTask.estimated_hours = roundDraftEstimatedHours(
        nextTask.subtasks.reduce(
          (total, child) => total + parseDraftEstimatedHours(child.estimated_hours),
          0,
        ),
      );
    }
    return nextTask;
  });
}

function buildPreviewTasks(
  tasks: TaskDraft[],
  rejectedPaths: Set<string>,
  parentPath: number[] = [],
): TaskDraft[] {
  return tasks.map((task, index) => {
    const path = [...parentPath, index];
    const nextTask = { ...task };
    const children = task.subtasks || [];
    if (children.length > 0) {
      nextTask.subtasks = buildPreviewTasks(children, rejectedPaths, path);
      const visibleChildren = nextTask.subtasks.filter(
        (_child, childIndex) => !isDraftTaskRejected([...path, childIndex], rejectedPaths),
      );
      nextTask.estimated_hours = roundDraftEstimatedHours(
        visibleChildren.reduce(
          (total, child) => total + parseDraftEstimatedHours(child.estimated_hours),
          0,
        ),
      );
    }
    return nextTask;
  });
}

export function TaskDraftConfirm({
  draft,
  projectId,
  messageId,
  initialStatus = "pending",
  onDraftResolved,
}: {
  draft: string;
  projectId?: string | null;
  messageId?: string;
  initialStatus?: "pending" | "confirmed" | "rejected";
  onDraftResolved?: (messageId: string, status: "confirmed" | "rejected") => void;
}) {
  // The server-owned draft record is the source of truth. Do not let a
  // browser cache entry for an unrelated old message resolve a new draft.
  const persistedStatus = null;
  const resolvedInitialStatus =
    initialStatus !== "pending"
      ? initialStatus
      : persistedStatus === "confirmed" || persistedStatus === "rejected"
        ? persistedStatus
        : "pending";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(resolvedInitialStatus === "confirmed");
  const [isRejected, setIsRejected] = useState(resolvedInitialStatus === "rejected");
  const [error, setError] = useState<string | null>(null);
  const [rejectedPaths, setRejectedPaths] = useState<Set<string>>(new Set());
  const [editingPath, setEditingPath] = useState<number[] | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDraft | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const descEditorRef = useRef<HTMLDivElement | null>(null);
  const descSeedRef = useRef("");
  const [projectMembers, setProjectMembers] = useState<ProjectMemberResponse[]>([]);
  const [loadedProject, setLoadedProject] = useState<{
    id: string;
    type: "agile" | "waterfall" | null;
  } | null>(null);

  const draftHash = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < draft.length; i++) {
      hash = ((hash << 5) - hash) + draft.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }, [draft]);

  const [tasksData, setTasksData] = useState<TaskDraft[]>(() => {
    try {
      const data = JSON.parse(draft);
      return Array.isArray(data) ? syncDraftTaskRollups(data) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const data = JSON.parse(draft);
      if (Array.isArray(data)) {
        setTasksData(syncDraftTaskRollups(data));
      }
    } catch {
      // Ignore partial draft JSON during streaming
    }
  }, [draft]);

  useEffect(() => {
    if (resolvedInitialStatus === "confirmed") {
      setIsSuccess(true);
      setIsRejected(false);
    } else if (resolvedInitialStatus === "rejected") {
      setIsRejected(true);
      setIsSuccess(false);
    } else if (resolvedInitialStatus === "pending") {
      setIsSuccess(false);
      setIsRejected(false);
    }
  }, [resolvedInitialStatus]);

  const hasPersistedMessage = isPersistedMessageId(messageId);
  const resolvedProjectId = projectId || (tasksData[0]?.project_id ? String(tasksData[0].project_id) : null);
  const projectType =
    loadedProject?.id === resolvedProjectId ? loadedProject.type : null;
  const assigneeOptions = useMemo(
    () => projectMembers.filter((member) => member.isActive).map(memberToUserProfile),
    [projectMembers],
  );
  const previewTasksData = useMemo(
    () => buildPreviewTasks(tasksData, rejectedPaths),
    [tasksData, rejectedPaths],
  );

  useEffect(() => {
    let cancelled = false;
    if (!resolvedProjectId) return () => { cancelled = true; };

    projectApi
      .get(resolvedProjectId)
      .then(async (response) => {
        if (cancelled) return;
        const type = response.data.projectType;
        setLoadedProject({ id: resolvedProjectId, type });
        if (type !== "waterfall") {
          setProjectMembers([]);
          return;
        }
        const membersResponse = await projectApi.listMembers(resolvedProjectId);
        if (!cancelled) setProjectMembers(membersResponse.data || []);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedProject({ id: resolvedProjectId, type: null });
          setProjectMembers([]);
        }
      });
    return () => { cancelled = true; };
  }, [resolvedProjectId]);

  useEffect(() => {
    if (typeof window === "undefined" || resolvedInitialStatus !== "pending") {
      if (typeof window !== "undefined") {
        localStorage.removeItem(`draft_rejects_${draftHash}`);
      }
      return;
    }
    const savedRejects = localStorage.getItem(`draft_rejects_${draftHash}`);
    if (savedRejects) {
      try { setRejectedPaths(new Set(JSON.parse(savedRejects))); } catch { /* ignore */ }
    }
  }, [draftHash, resolvedInitialStatus]);

  const editingPathKey = editingPath ? editingPath.join("-") : "";

  useLayoutEffect(() => {
    const node = descEditorRef.current;
    if (!editingPathKey || !node) return;
    node.innerHTML = draftMarkdownToHtml(descSeedRef.current);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        if (!closestInEditor(window.getSelection()?.anchorNode ?? null, node, ["LI"])) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        handleDescriptionEnter(node);
        return;
      }
      if (event.key === " " || event.code === "Space") {
        if (convertDashLineToBullet(node, false)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }
    };

    const onBeforeInput = (event: Event) => {
      const inputEvent = event as InputEvent;
      if (inputEvent.inputType !== "insertParagraph") return;
      if (!closestInEditor(window.getSelection()?.anchorNode ?? null, node, ["LI"])) return;
      inputEvent.preventDefault();
      inputEvent.stopImmediatePropagation();
    };

    node.addEventListener("keydown", onKeyDown, true);
    node.addEventListener("beforeinput", onBeforeInput, true);
    return () => {
      node.removeEventListener("keydown", onKeyDown, true);
      node.removeEventListener("beforeinput", onBeforeInput, true);
    };
  }, [editingPathKey]);

  const saveRejectedPaths = (newRejects: Set<string>) => {
    setRejectedPaths(newRejects);
    if (typeof window !== "undefined") {
      localStorage.setItem(`draft_rejects_${draftHash}`, JSON.stringify(Array.from(newRejects)));
    }
  };

  if (tasksData.length === 0) {
    try {
      JSON.parse(draft);
    } catch {
      return (
        <div style={{ margin: "16px 0", display: "flex", alignItems: "center", gap: "12px", padding: "16px", borderRadius: "12px", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontFamily: "sans-serif", fontSize: "14px" }}>
          <svg style={{ animation: "spin 1s linear infinite" }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          Đang xử lý phân chia công việc...
        </div>
      );
    }
    return null;
  }

  const handleToggleReject = (pathStr: string) => {
    const newSet = new Set(rejectedPaths);
    if (newSet.has(pathStr)) {
      newSet.delete(pathStr);
    } else {
      newSet.add(pathStr);
    }
    saveRejectedPaths(newSet);
  };

  const openEditor = (task: TaskDraft, path: number[]) => {
    setEditingPath(path);
    const nextTask = {
      ...task,
      assignee_ids: task.assignee_ids ? [...task.assignee_ids] : undefined,
    };
    if (projectType === "agile") {
      delete nextTask.assignee_id;
      delete nextTask.assignee_ids;
      delete nextTask.assignee_name;
    }
    setEditingTask(nextTask);
    descSeedRef.current = formatDraftDescription(nextTask.description);
    setError(null);
  };

  const handleSaveTask = async () => {
    if (!editingTask || !editingPath || !messageId || !hasPersistedMessage) return;
    if (!editingTask.title.trim()) {
      setError("Tên task không được để trống.");
      return;
    }
    if (editingTask.start_date && editingTask.deadline && editingTask.deadline < editingTask.start_date) {
      setError("Hạn chót không thể trước ngày bắt đầu.");
      return;
    }
    const previousTasks = tasksData;
    try {
      setIsSavingDraft(true);
      setError(null);
      const editedMarkdown = descEditorRef.current
        ? htmlToDraftMarkdown(descEditorRef.current)
        : formatDraftDescription(editingTask.description);
      const taskToSave = {
        ...editingTask,
        title: editingTask.title.trim(),
        description: descriptionForSave(editingTask.description, editedMarkdown),
      };
      if (projectType === "agile" || (taskToSave.subtasks || []).length > 0) {
        delete taskToSave.assignee_id;
        delete taskToSave.assignee_ids;
        delete taskToSave.assignee_name;
      }
      const nextTasks = syncDraftTaskRollups(replaceTaskAtPath(tasksData, editingPath, taskToSave));
      setTasksData(nextTasks);
      const response = await aiApi.updateDraft(
        Number(messageId),
        nextTasks,
      );
      setTasksData(syncDraftTaskRollups(response.payload as TaskDraft[]));
      setEditingPath(null);
      setEditingTask(null);
    } catch (e: any) {
      setTasksData(previousTasks);
      setError(e.message || "Không thể lưu thay đổi bản nháp.");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const markResolved = (status: "confirmed" | "rejected") => {
    if (messageId) {
      onDraftResolved?.(messageId, status);
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(`draft_rejects_${draftHash}`);
    }
  };

  const handleConfirmSelected = async () => {
    if (!hasPersistedMessage || !messageId) {
      setError("Bản nháp chưa được lưu. Vui lòng đợi tin nhắn lưu xong rồi xác nhận lại.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);

      const allRejected = tasksData.every((_, index) =>
        rejectedPaths.has(String(index))
      );
      if (allRejected) {
        await handleRejectAll();
        return;
      }

      await aiApi.confirmTasks(Number(messageId), {
        projectId: projectId ? Number(projectId) : null,
        rejectedPaths: Array.from(rejectedPaths),
      });
      setIsSuccess(true);
      markResolved("confirmed");
    } catch (e: any) {
      setError(e.message || "Có lỗi xảy ra khi tạo task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectAll = async () => {
    if (!hasPersistedMessage || !messageId) {
      setError("Bản nháp chưa được lưu. Vui lòng đợi tin nhắn lưu xong rồi thử lại.");
      return;
    }
    try {
      setIsSubmitting(true);
      await aiApi.rejectDraft(Number(messageId));
      setIsRejected(true);
      markResolved("rejected");
    } catch (e: any) {
      setError(e.message || "Không thể từ chối bản nháp.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div style={{ margin: "12px 0", display: "flex", alignItems: "center", gap: "16px", borderRadius: "12px", border: "1px solid #bbf7d0", backgroundColor: "#f0fdf4", padding: "20px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: "40px", width: "40px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "50%", backgroundColor: "#dcfce7", border: "1px solid #86efac", color: "#16a34a" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 600, color: "#166534", letterSpacing: "0.025em", whiteSpace: "normal", wordWrap: "break-word" }}>Tạo task thành công</h4>
          <p style={{ margin: 0, fontSize: "12px", color: "#15803d", whiteSpace: "normal", wordWrap: "break-word", lineHeight: 1.5 }}>Bản nháp đã được ghi nhận vào hệ thống. Hãy tải lại bảng công việc.</p>
        </div>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div style={{ margin: "12px 0", display: "flex", alignItems: "center", gap: "16px", borderRadius: "12px", border: "1px solid #fecaca", backgroundColor: "#fef2f2", padding: "20px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: "40px", width: "40px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "50%", backgroundColor: "#fee2e2", border: "1px solid #fca5a5", color: "#dc2626" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 600, color: "#991b1b", letterSpacing: "0.025em", whiteSpace: "normal", wordWrap: "break-word" }}>Bản nháp đã bị hủy</h4>
          <p style={{ margin: 0, fontSize: "12px", color: "#b91c1c", whiteSpace: "normal", wordWrap: "break-word", lineHeight: 1.5 }}>Bạn đã từ chối bản nháp công việc này.</p>
        </div>
      </div>
    );
  }

  const actionsDisabled = isSubmitting || isSavingDraft || !hasPersistedMessage;

  if (!hasPersistedMessage) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", margin: "16px 0", backgroundColor: "#f0fdf4", borderRadius: "12px", color: "#166534", border: "1px solid #bbf7d0", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)", fontFamily: "sans-serif" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
          </path>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
           <span style={{ fontSize: "14px", fontWeight: 600 }}>Đang lưu bản nháp vào hệ thống...</span>
           <span style={{ fontSize: "12px", color: "#15803d", opacity: 0.9 }}>Bản nháp sẽ hiển thị ngay khi dữ liệu được ghi nhận hoàn tất.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      margin: "16px 0",
      overflow: "hidden",
      borderRadius: "12px",
      border: "1px solid #e4e4e7",
      borderBottom: "4px solid #d4d4d8",
      backgroundColor: "#ffffff",
      boxShadow: "0 8px 12px -2px rgba(0,0,0,0.12), 0 4px 6px -1px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)",
      fontFamily: "sans-serif",
      color: "#18181b",
      boxSizing: "border-box",
      maxWidth: "100%"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e4e4e7", backgroundColor: "#fafafa", padding: "16px 20px" }}>
        <h4 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "14px", fontWeight: 600, color: "#09090b", letterSpacing: "0.025em" }}>
          <svg style={{ color: "#3b82f6" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Bản nháp {tasksData.length} công việc
        </h4>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "20px", boxSizing: "border-box", width: "100%" }}>
        {(() => {
          const renderTask = (task: TaskDraft, path: number[], depth: number = 0) => {
            const pathStr = path.join("-");
            const isInherentlyRejected = isDraftTaskRejected(path, rejectedPaths);
            const description = formatDraftDescription(task.description);

            return (
              <div key={pathStr} style={{ marginLeft: depth > 0 ? `${depth * 20}px` : "0", borderLeft: depth > 0 ? "2px solid #e4e4e7" : "none", paddingLeft: depth > 0 ? "16px" : "0", marginTop: depth > 0 ? "8px" : "0", boxSizing: "border-box", minWidth: 0 }}>
                <div
                  onClick={() => {
                    if (!isInherentlyRejected && hasPersistedMessage) {
                      openEditor(task, path);
                    }
                  }}
                  style={{
                    position: "relative", borderRadius: "12px", border: "1px solid #e4e4e7",
                    backgroundColor: isInherentlyRejected ? "#fafafa" : "#ffffff",
                    padding: "16px",
                    cursor: isInherentlyRejected || !hasPersistedMessage ? "default" : "pointer",
                    boxSizing: "border-box", width: "100%", minWidth: 0,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "6px" }}>
                    <h5 style={{
                      margin: 0, fontSize: "14px", fontWeight: 600, color: "#18181b", overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "normal", flex: 1,
                      opacity: isInherentlyRejected ? 0.6 : 1,
                      filter: isInherentlyRejected ? "grayscale(50%)" : "none"
                    }}>
                      {isInherentlyRejected && <del>{task.title || "Chưa có tiêu đề"}</del>}
                      {!isInherentlyRejected && (task.title || "Chưa có tiêu đề")}
                    </h5>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleReject(pathStr);
                      }}
                      style={{
                        padding: "4px 8px", fontSize: "11px", fontWeight: 600, borderRadius: "6px", cursor: "pointer", flexShrink: 0,
                        backgroundColor: rejectedPaths.has(pathStr) ? "#16a34a" : "#fee2e2",
                        color: rejectedPaths.has(pathStr) ? "#ffffff" : "#dc2626",
                        border: `1px solid ${rejectedPaths.has(pathStr) ? "#15803d" : "#fca5a5"}`,
                        display: "flex", justifyContent: "center", alignItems: "center", gap: "4px",
                        boxShadow: rejectedPaths.has(pathStr) ? "0 1px 2px rgba(21, 128, 61, 0.25)" : "none"
                      }}
                    >
                      {rejectedPaths.has(pathStr) ? (
                        <>Khôi phục</>
                      ) : (
                        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Loại bỏ</>
                      )}
                    </button>
                  </div>

                  {description && (
                    <div style={{
                      margin: "0 0 16px 0", fontSize: "13px", color: "#52525b", lineHeight: "1.625",
                      opacity: isInherentlyRejected ? 0.6 : 1,
                      filter: isInherentlyRejected ? "grayscale(50%)" : "none"
                    }} className="draft-markdown prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
                      <ReactMarkdown>{description}</ReactMarkdown>
                    </div>
                  )}

                  <div style={{
                    display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "11px", fontWeight: 600, letterSpacing: "0.025em",
                    opacity: isInherentlyRejected ? 0.6 : 1,
                    filter: isInherentlyRejected ? "grayscale(50%)" : "none"
                  }}>
                    {task.priority && (() => {
                      const priorityKey = normalizeTaskPriority(task.priority);
                      const pill = taskPriorityPillStyle(priorityKey);
                      return (
                        <span style={{
                          display: "inline-flex", alignItems: "center", borderRadius: "6px", padding: "4px 8px",
                          textTransform: "uppercase",
                          color: pill.color,
                          backgroundColor: pill.backgroundColor,
                          border: `1px solid ${pill.borderColor}`,
                        }}>
                          {taskPriorityLabel(priorityKey)}
                        </span>
                      );
                    })()}
                    {formatDraftAssigneeNames(task, projectMembers) && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "6px", backgroundColor: "#eff6ff", padding: "4px 10px", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        {formatDraftAssigneeNames(task, projectMembers)}
                      </span>
                    )}
                    {task.estimated_hours !== undefined && (
                      <span title="Thời gian ước tính (ET)" style={{ display: "inline-flex", alignItems: "center", gap: "4px", borderRadius: "6px", backgroundColor: "#fef3c7", padding: "4px 10px", color: "#b45309", border: "1px solid #fde68a" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        {task.estimated_hours}h
                      </span>
                    )}
                    {task.start_date && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", borderRadius: "6px", backgroundColor: "#f3f4f6", padding: "4px 10px", color: "#4b5563", border: "1px solid #e5e7eb" }}>
                        Bắt đầu: {task.start_date}
                      </span>
                    )}
                    {task.deadline && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", borderRadius: "6px", backgroundColor: "#f3f4f6", padding: "4px 10px", color: "#4b5563", border: "1px solid #e5e7eb" }}>
                        Hạn chót: {task.deadline}
                      </span>
                    )}
                    {(task.parent_task_title || task.parent_task_id) && (
                      <span title={task.parent_task_title ? `Task cha: ${task.parent_task_title}` : `Task cha #${task.parent_task_id}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", borderRadius: "6px", backgroundColor: "#f0fdf4", padding: "4px 10px", color: "#15803d", border: "1px solid #bbf7d0" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        Trực thuộc: {task.parent_task_title ? `"${task.parent_task_title}"` : `Task #${task.parent_task_id}`}
                      </span>
                    )}
                  </div>
                </div>
                {task.subtasks && task.subtasks.map((sub, i) => renderTask(sub, [...path, i], depth + 1))}
              </div>
            );
          };
          return previewTasksData.map((task, idx) => renderTask(task, [idx]));
        })()}

        <div style={{ display: "flex", gap: "8px", marginTop: "12px", paddingTop: "16px", borderTop: "1px dashed #e4e4e7" }}>
          <button
            onClick={handleRejectAll}
            disabled={actionsDisabled}
            style={{
              flex: 1, padding: "10px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", cursor: actionsDisabled ? "not-allowed" : "pointer",
              backgroundColor: "#ffffff", color: "#52525b", border: "1px solid #e4e4e7", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px",
              opacity: actionsDisabled ? 0.7 : 1
            }}
          >
            Hủy toàn bộ
          </button>
          <button
            onClick={handleConfirmSelected}
            disabled={actionsDisabled}
            style={{
              flex: 2, padding: "10px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", cursor: actionsDisabled ? "not-allowed" : "pointer",
              backgroundColor: actionsDisabled ? "#bfdbfe" : "#2563eb", color: "#ffffff", border: "1px solid transparent", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px"
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            {isSubmitting ? "Đang xử lý..." : "Xác nhận các task đã chọn"}
          </button>
        </div>

        {error && <div style={{ marginTop: "8px", fontSize: "13px", color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", border: "1px solid #fca5a5" }}>{error}</div>}
      </div>

      {editingTask && editingPath && (
        <div
          onClick={() => {
            if (!isSavingDraft) {
              setEditingTask(null);
              setEditingPath(null);
            }
          }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", background: "rgba(15, 23, 42, 0.55)" }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="task-detail-modal draft-task-modal"
            style={{ width: "min(640px, 100%)", maxHeight: "90vh", height: "auto", borderRadius: "16px", background: "#fff", boxShadow: "0 24px 60px rgba(15, 23, 42, 0.25)", display: "flex", flexDirection: "column" }}
          >
            <div className="task-detail-header">
              <div style={{ flex: 1, marginRight: "1rem" }}>
                <div style={{ fontSize: "0.875rem", color: "var(--foreground-muted)", marginBottom: "0.5rem" }}>
                  DRAFT TASK
                </div>
                <input
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  placeholder="Tên công việc..."
                  style={{
                    width: "100%",
                    fontSize: "1.25rem",
                    fontWeight: 600,
                    padding: "0.5rem",
                    marginLeft: "-0.5rem",
                    borderRadius: "4px",
                    border: "1px solid transparent",
                    background: "var(--surface-sunken)",
                    color: "var(--foreground)",
                  }}
                  onFocus={(e) => e.target.style.borderColor = "var(--border)"}
                  onBlur={(e) => e.target.style.borderColor = "transparent"}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  onClick={() => { setEditingTask(null); setEditingPath(null); }}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "1.35rem",
                    cursor: "pointer",
                    color: "var(--foreground-muted)",
                    padding: "0.25rem 0.5rem",
                  }}
                >
                  &times;
                </button>
              </div>
            </div>

            <div style={{ overflowY: "auto", padding: "0.9rem 1.15rem 0.75rem", flex: "0 1 auto", minHeight: 0 }}>
              <div className="task-detail-fields-grid">
                <label className="task-detail-field">
                  <span className="task-detail-field-label">Trạng thái</span>
                  <CustomSelect
                    className="task-detail-control"
                    value={editingTask.status || "todo"}
                    onChange={(val) => setEditingTask({ ...editingTask, status: val as TaskDraft["status"] })}
                    style={{
                      color:
                        editingTask.status === "done"
                          ? "#15803d"
                          : editingTask.status === "in_progress"
                            ? "#1d4ed8"
                            : "#b45309",
                      backgroundColor:
                        editingTask.status === "done"
                          ? "rgba(34, 197, 94, 0.15)"
                          : editingTask.status === "in_progress"
                            ? "rgba(59, 130, 246, 0.15)"
                            : "rgba(250, 204, 21, 0.18)",
                    }}
                    options={[
                      { value: "todo", label: "Cần làm" },
                      { value: "in_progress", label: "Đang tiến hành" },
                      { value: "done", label: "Hoàn thành" },
                    ]}
                  />
                </label>

                <label className="task-detail-field">
                  <span className="task-detail-field-label">Ưu tiên</span>
                  <CustomSelect
                    className="task-detail-control"
                    value={editingTask.priority || "medium"}
                    onChange={(val) => setEditingTask({ ...editingTask, priority: val as TaskDraft["priority"] })}
                    style={{
                      color:
                        editingTask.priority === "critical"
                          ? "#b91c1c"
                          : editingTask.priority === "high"
                            ? "#b45309"
                          : editingTask.priority === "medium"
                            ? "#15803d"
                            : "#0369a1",
                      backgroundColor:
                        editingTask.priority === "critical"
                          ? "rgba(220, 38, 38, 0.15)"
                          : editingTask.priority === "high"
                            ? "rgba(217, 119, 6, 0.15)"
                          : editingTask.priority === "medium"
                            ? "rgba(22, 163, 74, 0.15)"
                            : "rgba(2, 132, 199, 0.15)",
                    }}
                    options={[
                      { value: "low", label: "Thấp" },
                      { value: "medium", label: "Trung bình" },
                      { value: "high", label: "Cao" },
                      { value: "critical", label: "Khẩn cấp" },
                    ]}
                  />
                </label>

                <label className="task-detail-field">
                  <span className="task-detail-field-label">Người thực hiện</span>
                  <AssigneeSelect
                    className="task-detail-control"
                    value={
                      (editingTask.subtasks || []).length > 0
                        ? []
                        : (editingTask.assignee_ids || (editingTask.assignee_id ? [editingTask.assignee_id] : [])).map((id) => `usr-${id}`)
                    }
                    options={assigneeOptions}
                    disabled={!resolvedProjectId || projectType !== "waterfall" || (editingTask.subtasks || []).length > 0}
                    placeholder={
                      (editingTask.subtasks || []).length > 0
                        ? formatDraftAssigneeNames(editingTask, projectMembers) || "Lấy từ các task con"
                        : formatDraftAssigneeNames(editingTask, projectMembers) || "-- Chưa phân công --"
                    }
                    dropdownPlacement="top"
                    onChange={(selectedIds) => {
                      const ids = selectedIds
                        .map((id) => Number(id.replace(/^usr-/, "")))
                        .filter((id) => Number.isInteger(id) && id > 0);
                      const names = ids
                        .map((id) => projectMembers.find((member) => member.userId === id)?.userName)
                        .filter(Boolean) as string[];
                      setEditingTask({
                        ...editingTask,
                        assignee_ids: ids.length ? ids : undefined,
                        assignee_id: ids[0],
                        assignee_name: names.length ? names.join(", ") : undefined,
                      });
                    }}
                  />
                </label>

                <label className="task-detail-field">
                  <span className="task-detail-field-label">Thời gian ước tính (giờ)</span>
                  <input
                    className="task-detail-control"
                    type="number"
                    min="0"
                    step="0.5"
                    value={editingTask.estimated_hours ?? ""}
                    onChange={(e) => setEditingTask({ ...editingTask, estimated_hours: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </label>

                <label className="task-detail-field">
                  <span className="task-detail-field-label">Ngày bắt đầu</span>
                  <span className="task-detail-date">
                    <input
                      className="task-detail-control"
                      type="date"
                      value={editingTask.start_date || ""}
                      max={editingTask.deadline || ""}
                      onChange={(e) => setEditingTask({ ...editingTask, start_date: e.target.value || undefined })}
                    />
                    <span className="task-detail-date-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </span>
                  </span>
                </label>

                <label className="task-detail-field">
                  <span className="task-detail-field-label">Hạn chót</span>
                  <span className="task-detail-date">
                    <input
                      className="task-detail-control"
                      type="date"
                      value={editingTask.deadline || ""}
                      min={editingTask.start_date || ""}
                      onChange={(e) => setEditingTask({ ...editingTask, deadline: e.target.value || undefined })}
                    />
                    <span className="task-detail-date-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </span>
                  </span>
                </label>
              </div>

              <div className="task-detail-description-panel" style={{ marginTop: "0.85rem" }}>
                <span className="task-detail-field-label">Mô tả công việc</span>
                <div
                  key={editingPathKey}
                  ref={descEditorRef}
                  className="draft-desc-editor draft-markdown"
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-multiline="true"
                  tabIndex={0}
                  data-placeholder="Nhấp để sửa mô tả công việc..."
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    descEditorRef.current?.focus();
                  }}
                />
              </div>
            </div>

            <div style={{ padding: "12px 20px", display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderBottomLeftRadius: "16px", borderBottomRightRadius: "16px", flexShrink: 0 }}>
              <button type="button" disabled={isSavingDraft} onClick={() => { setEditingTask(null); setEditingPath(null); }} style={{ padding: "9px 16px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }}>Hủy</button>
              <button type="button" disabled={isSavingDraft} onClick={handleSaveTask} style={{ padding: "9px 16px", border: 0, borderRadius: 8, background: "#2563eb", color: "#fff" }}>{isSavingDraft ? "Đang lưu..." : "Lưu vào bản nháp"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
