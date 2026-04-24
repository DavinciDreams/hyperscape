/**
 * Severity-bucket filter for the Plugin Browser. Reduces a
 * `Map<pluginId, PluginBrowserRowSummary>` down to just the rows
 * matching the requested severities. Order is preserved so the
 * resulting table stays in the same row order as the source map.
 *
 * Pure transform. Never throws.
 */

import type {
  PluginBrowserRowSummary,
  PluginRowSummarySeverity,
} from "./PluginBrowserRowSummary.js";

export interface PluginBrowserSeverityFilter {
  /**
   * Severities to include. If empty or undefined, all rows pass.
   */
  readonly include?: ReadonlySet<PluginRowSummarySeverity>;
  /**
   * Severities to exclude (applied after `include`). Empty/undefined
   * means no exclusion.
   */
  readonly exclude?: ReadonlySet<PluginRowSummarySeverity>;
}

export function filterPluginBrowserRowsBySeverity(
  rows: ReadonlyMap<string, PluginBrowserRowSummary>,
  filter: PluginBrowserSeverityFilter = {},
): ReadonlyMap<string, PluginBrowserRowSummary> {
  const includeAll = !filter.include || filter.include.size === 0;
  const excludeNone = !filter.exclude || filter.exclude.size === 0;
  if (includeAll && excludeNone) return rows;

  const out = new Map<string, PluginBrowserRowSummary>();
  for (const [id, row] of rows) {
    if (!includeAll && !filter.include!.has(row.severity)) continue;
    if (!excludeNone && filter.exclude!.has(row.severity)) continue;
    out.set(id, row);
  }
  return out;
}

/**
 * Convenience: filter to broken-only rows (severity === "error").
 * Mirrors the most common Plugin Browser filter in the editor.
 */
export function filterBrokenRows(
  rows: ReadonlyMap<string, PluginBrowserRowSummary>,
): ReadonlyMap<string, PluginBrowserRowSummary> {
  return filterPluginBrowserRowsBySeverity(rows, {
    include: new Set(["error"]),
  });
}

/**
 * Convenience: filter to needs-attention rows (warning OR error).
 */
export function filterNeedsAttentionRows(
  rows: ReadonlyMap<string, PluginBrowserRowSummary>,
): ReadonlyMap<string, PluginBrowserRowSummary> {
  return filterPluginBrowserRowsBySeverity(rows, {
    include: new Set(["warning", "error"]),
  });
}
