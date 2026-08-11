/**
 * Normalize notification deep-links to routes that exist in the App Router.
 * Older seed/API payloads used paths like `/projects/:id/tasks/:taskId` which 404.
 */
export function resolveNotificationLink(link: string | null | undefined): string {
  const raw = (link || "").trim();
  if (!raw) {
    return "/dashboard";
  }

  const taskMatch = raw.match(/^\/projects\/([^/?#]+)\/tasks\/([^/?#]+)\/?$/i);
  if (taskMatch) {
    const [, projectId, taskId] = taskMatch;
    return `/projects/${projectId}?highlightTaskId=${taskId}`;
  }

  const logworkMatch = raw.match(/^\/projects\/([^/?#]+)\/logworks\/?$/i);
  if (logworkMatch) {
    return "/logwork-approvals";
  }

  const projectOnlyHighlight = raw.match(
    /^\/projects\/([^/?#]+)\?(.*)$/i,
  );
  if (projectOnlyHighlight) {
    const [, projectId, query] = projectOnlyHighlight;
    const params = new URLSearchParams(query);
    if (params.has("highlightTaskId") && !params.has("tab")) {
      return `/projects/${projectId}?${params.toString()}`;
    }
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
}
