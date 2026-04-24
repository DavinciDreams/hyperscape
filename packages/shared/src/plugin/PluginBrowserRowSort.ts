/**
 * Stable sort comparators for {@link PluginBrowserRowSummary} arrays.
 * Powers the Plugin Browser column-header sort UI. Returns new arrays;
 * never mutates the input.
 *
 * Pure transform. Never throws.
 */

import type {
  PluginBrowserRowSummary,
  PluginRowSummarySeverity,
} from "./PluginBrowserRowSummary.js";

export type PluginBrowserRowSortKey = "severity" | "pluginId" | "label";
export type PluginBrowserRowSortDirection = "asc" | "desc";

export interface PluginBrowserRowSortOrder {
  readonly key: PluginBrowserRowSortKey;
  readonly direction: PluginBrowserRowSortDirection;
}

const SEVERITY_RANK: Record<PluginRowSummarySeverity, number> = {
  ok: 0,
  info: 1,
  warning: 2,
  error: 3,
};

/**
 * Returns a new array of rows sorted by the given key+direction.
 * Sort is stable: ties fall back to source-array order.
 *
 * For `key === "severity"`, ascending sorts ok→error (lowest severity
 * first); descending sorts error→ok (broken-first — the default the
 * editor wants).
 */
export function sortPluginBrowserRowSummaries(
  rows: readonly PluginBrowserRowSummary[],
  order: PluginBrowserRowSortOrder,
): readonly PluginBrowserRowSummary[] {
  // Decorate with original index for stable tie-breaking, sort, undecorate.
  const decorated = rows.map((row, index) => ({ row, index }));
  const cmp = comparatorFor(order);
  decorated.sort((a, b) => {
    const primary = cmp(a.row, b.row);
    if (primary !== 0) return primary;
    return a.index - b.index;
  });
  return decorated.map((d) => d.row);
}

/**
 * Convenience: sort by severity descending (broken-first), the
 * default the editor renders on first paint.
 */
export function sortPluginBrowserRowSummariesByWorstFirst(
  rows: readonly PluginBrowserRowSummary[],
): readonly PluginBrowserRowSummary[] {
  return sortPluginBrowserRowSummaries(rows, {
    key: "severity",
    direction: "desc",
  });
}

function comparatorFor(
  order: PluginBrowserRowSortOrder,
): (a: PluginBrowserRowSummary, b: PluginBrowserRowSummary) => number {
  const sign = order.direction === "asc" ? 1 : -1;
  switch (order.key) {
    case "severity":
      return (a, b) =>
        sign * (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    case "pluginId":
      return (a, b) => sign * a.pluginId.localeCompare(b.pluginId);
    case "label":
      return (a, b) => sign * a.label.localeCompare(b.label);
  }
}
