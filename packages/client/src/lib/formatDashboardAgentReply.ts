/**
 * Normalizes POST /api/agents/:id/message JSON for dashboard UIs.
 * Success responses include `text` (LLM or scripted intent) plus optional `meta`.
 */
export type DashboardMessageApiPayload = {
  success?: boolean;
  message?: string;
  text?: string;
  content?: string;
  id?: string | null;
  meta?: {
    delivery?: string;
    command?: string;
    source?: string;
    provider?: string;
    model?: string;
    execution?: string;
    targetName?: string;
  };
};

export function formatDashboardAgentReply(
  data: DashboardMessageApiPayload | null | undefined,
): string {
  if (!data) {
    return "No reply text in response";
  }
  const fromText =
    typeof data.text === "string" && data.text.trim() ? data.text.trim() : null;
  const fromContent =
    typeof data.content === "string" && data.content.trim()
      ? data.content.trim()
      : null;
  if (fromText) {
    return fromText;
  }
  if (fromContent) {
    return fromContent;
  }
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  return "No reply text in response";
}

/** Subtle second line for provider / command / fallback (optional). */
export function formatDashboardAgentReplyMetaLine(
  data: DashboardMessageApiPayload | null | undefined,
): string | null {
  if (!data?.meta) {
    return null;
  }
  const m = data.meta;
  const parts: string[] = [];
  if (m.delivery === "dashboard_command" && m.command) {
    parts.push(m.command);
  }
  if (m.targetName) {
    parts.push(m.targetName);
  }
  if (m.provider) {
    const model = m.model && m.model !== "provider default" ? m.model : null;
    parts.push(model ? `${m.provider} · ${model}` : m.provider);
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join(" · ");
}
