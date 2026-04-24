/**
 * Deterministic text serialization of Plugin Browser rows for
 * copy-to-clipboard, bug reports, Slack/GitHub-issue sharing, and
 * CI log output.
 *
 * Two formats are supported:
 *  - `plain` — tab-delimited single-line summary (one row per line),
 *    suitable for terminal paste or quick inspection.
 *  - `markdown` — fenced table form (GitHub-flavored), suitable for
 *    pasting into a PR / issue / Slack post.
 *
 * All transforms are **pure string builders**:
 *  - No DOM, no clipboard API, no async.
 *  - Deterministic output for identical input.
 *  - Stable input ordering — rows render in the caller-provided
 *    order; callers can pre-sort as they wish.
 *  - Empty input yields an empty string (not a header-only table).
 *
 * Never throws.
 */

import type {
  PluginBrowserRowSummary,
  PluginRowSummarySeverity,
} from "./PluginBrowserRowSummary.js";

export type PluginBrowserClipboardFormat = "plain" | "markdown";

/**
 * Serialize a single row. Equivalent to calling
 * `formatPluginBrowserRows([row], format)` but skips table framing
 * in `markdown` mode — you get a single-line summary instead.
 */
export function formatPluginBrowserRow(
  row: PluginBrowserRowSummary,
  format: PluginBrowserClipboardFormat = "plain",
): string {
  if (format === "markdown") {
    return formatMarkdownLine(row);
  }
  return formatPlainLine(row);
}

/**
 * Serialize an array of rows. For `plain`: one tab-delimited line
 * per row with a header line on top. For `markdown`: a GitHub-flavored
 * table. Returns `""` for empty input.
 */
export function formatPluginBrowserRows(
  rows: readonly PluginBrowserRowSummary[],
  format: PluginBrowserClipboardFormat = "plain",
): string {
  if (rows.length === 0) return "";

  if (format === "markdown") {
    const lines: string[] = [];
    lines.push("| plugin | severity | label | reasons |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of rows) {
      lines.push(formatMarkdownTableRow(row));
    }
    return lines.join("\n");
  }

  // Plain TSV with header.
  const lines: string[] = [];
  lines.push(["plugin", "severity", "label", "reasons"].join("\t"));
  for (const row of rows) {
    lines.push(formatPlainLine(row));
  }
  return lines.join("\n");
}

/**
 * Convenience: serialize just the plugin ids, one per line. Useful
 * when the user wants to paste a clean id list into a shell or
 * Slack snippet without the diagnostic noise.
 */
export function formatPluginBrowserPluginIds(
  rows: readonly PluginBrowserRowSummary[],
): string {
  if (rows.length === 0) return "";
  return rows.map((r) => r.pluginId).join("\n");
}

// ---------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------

function formatPlainLine(row: PluginBrowserRowSummary): string {
  return [
    row.pluginId,
    row.severity,
    row.label,
    joinReasonsForPlain(row.reasons),
  ].join("\t");
}

function formatMarkdownLine(row: PluginBrowserRowSummary): string {
  // Single-line markdown summary: backtick-wrapped id + severity badge + label.
  const reasons =
    row.reasons.length === 0 ? "" : ` — ${row.reasons.join("; ")}`;
  return `${severityBadge(row.severity)} \`${escapeMarkdownInline(row.pluginId)}\`: ${escapeMarkdownInline(row.label)}${escapeMarkdownInline(reasons)}`;
}

function formatMarkdownTableRow(row: PluginBrowserRowSummary): string {
  const reasonsCell =
    row.reasons.length === 0
      ? ""
      : row.reasons.map(escapeMarkdownTableCell).join("<br>");
  return `| \`${escapeMarkdownTableCell(row.pluginId)}\` | ${severityBadge(row.severity)} | ${escapeMarkdownTableCell(row.label)} | ${reasonsCell} |`;
}

function severityBadge(severity: PluginRowSummarySeverity): string {
  switch (severity) {
    case "error":
      return "[error]";
    case "warning":
      return "[warn]";
    case "info":
      return "[info]";
    case "ok":
      return "[ok]";
  }
}

function joinReasonsForPlain(reasons: readonly string[]): string {
  if (reasons.length === 0) return "";
  // Plain TSV keeps reasons on a single field; join with ' | '.
  return reasons.map((r) => r.replace(/\t/g, " ")).join(" | ");
}

/**
 * Escape characters that would break inline markdown rendering in
 * Slack/GitHub: pipes, asterisks, underscores, backticks, brackets.
 * We keep the escape conservative — the goal is paste-safe output,
 * not pixel-perfect styling.
 */
function escapeMarkdownInline(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-!|<>])/g, "\\$1");
}

/**
 * Table cells additionally neutralize pipes (which would split the
 * cell) and newlines (which would break the table).
 */
function escapeMarkdownTableCell(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}
