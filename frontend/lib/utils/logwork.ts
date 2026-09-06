export function resolveLogworkTitle(title?: string | null, workContent?: string | null) {
  const cleanedTitle = (title || "").trim();
  if (cleanedTitle) {
    return cleanedTitle;
  }

  const content = (workContent || "").trim();
  if (!content) {
    return "Logwork";
  }

  return content.length > 80 ? content.slice(0, 80).trim() : content;
}
