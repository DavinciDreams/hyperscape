/**
 * Aggregate counts for the Plugin Browser header bar. Reduces the
 * per-row {@link PluginBrowserRowSummary} map to severity counts plus
 * a short headline string the editor can render verbatim.
 *
 * Pure transform. Never throws.
 */

import type {
  PluginBrowserRowSummary,
  PluginRowSummarySeverity,
} from "./PluginBrowserRowSummary.js";

export interface PluginBrowserHeaderCounts {
  readonly total: number;
  readonly ok: number;
  readonly info: number;
  readonly warning: number;
  readonly error: number;
}

export interface PluginBrowserHeaderSummary {
  readonly counts: PluginBrowserHeaderCounts;
  /**
   * Highest severity present across all rows. Empty input yields
   * `"ok"` (the editor shows "0 plugins · all clear").
   */
  readonly worstSeverity: PluginRowSummarySeverity;
  /**
   * Short headline e.g. `"12 plugins · 2 warnings · 1 broken"`.
   * Trailing severity fragments are omitted when their count is zero.
   */
  readonly headline: string;
}

const SEVERITY_RANK: Record<PluginRowSummarySeverity, number> = {
  ok: 0,
  info: 1,
  warning: 2,
  error: 3,
};

export function summarizePluginBrowserHeader(
  rows: ReadonlyMap<string, PluginBrowserRowSummary>,
): PluginBrowserHeaderSummary {
  let ok = 0;
  let info = 0;
  let warning = 0;
  let error = 0;
  let worstRank = 0;
  for (const row of rows.values()) {
    switch (row.severity) {
      case "ok":
        ok += 1;
        break;
      case "info":
        info += 1;
        break;
      case "warning":
        warning += 1;
        break;
      case "error":
        error += 1;
        break;
    }
    const rank = SEVERITY_RANK[row.severity];
    if (rank > worstRank) worstRank = rank;
  }
  const total = ok + info + warning + error;
  const counts: PluginBrowserHeaderCounts = {
    total,
    ok,
    info,
    warning,
    error,
  };
  const worstSeverity = severityFromRank(worstRank);
  const headline = formatHeadline(counts);
  return { counts, worstSeverity, headline };
}

function severityFromRank(rank: number): PluginRowSummarySeverity {
  if (rank >= 3) return "error";
  if (rank === 2) return "warning";
  if (rank === 1) return "info";
  return "ok";
}

function formatHeadline(counts: PluginBrowserHeaderCounts): string {
  if (counts.total === 0) return "0 plugins";
  const parts: string[] = [
    `${counts.total} ${pluralize("plugin", counts.total)}`,
  ];
  if (counts.error > 0) {
    parts.push(
      `${counts.error} ${pluralize("broken", counts.error, "broken")}`,
    );
  }
  if (counts.warning > 0) {
    parts.push(`${counts.warning} ${pluralize("warning", counts.warning)}`);
  }
  if (counts.info > 0) {
    parts.push(
      `${counts.info} ${pluralize("unrated", counts.info, "unrated")}`,
    );
  }
  return parts.join(" · ");
}

function pluralize(word: string, count: number, invariant?: string): string {
  if (invariant !== undefined) return invariant;
  return count === 1 ? word : `${word}s`;
}
