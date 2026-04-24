/**
 * Aggregate statistics over a {@link PluginBrowserChangelogState}
 * window. Used to drive the "last 24h: 3 regressions, 1 recovery"
 * summary banner at the top of the Plugin Browser details pane and
 * the condensed counter strip on the main plugin list.
 *
 * Pure transform. Never throws. Safe to call on an empty changelog
 * (returns a fully-zeroed summary).
 */

import type { PluginRowSummarySeverity } from "./PluginBrowserRowSummary.js";
import type {
  PluginBrowserChangelogEntry,
  PluginBrowserChangelogFilter,
  PluginBrowserChangelogState,
} from "./PluginBrowserChangelog.js";
import { filterPluginBrowserChangelog } from "./PluginBrowserChangelog.js";
import type { PluginBrowserToastKind } from "./PluginBrowserToastRouter.js";

export interface PluginBrowserChangelogSummary {
  /** Total count of entries after filtering. */
  readonly total: number;
  /** Count per toast kind (all 5 kinds always present, 0 if absent). */
  readonly byKind: Readonly<Record<PluginBrowserToastKind, number>>;
  /** Count per severity (all 4 levels always present, 0 if absent). */
  readonly bySeverity: Readonly<Record<PluginRowSummarySeverity, number>>;
  /** Count per plugin id (only ids that appear at least once). */
  readonly byPluginId: Readonly<Record<string, number>>;
  /** Distinct plugin ids that appear. */
  readonly distinctPluginCount: number;
  /** Earliest timestamp in the window, or null if empty. */
  readonly firstTimestamp: number | null;
  /** Latest timestamp in the window, or null if empty. */
  readonly lastTimestamp: number | null;
}

function emptyKindCounts(): Record<PluginBrowserToastKind, number> {
  return {
    added: 0,
    removed: 0,
    regressed: 0,
    recovered: 0,
    "label-changed": 0,
  };
}

function emptySeverityCounts(): Record<PluginRowSummarySeverity, number> {
  return { ok: 0, info: 0, warning: 0, error: 0 };
}

export function emptyPluginBrowserChangelogSummary(): PluginBrowserChangelogSummary {
  return {
    total: 0,
    byKind: emptyKindCounts(),
    bySeverity: emptySeverityCounts(),
    byPluginId: {},
    distinctPluginCount: 0,
    firstTimestamp: null,
    lastTimestamp: null,
  };
}

export interface SummarizePluginBrowserChangelogOptions {
  /**
   * Optional filter applied before aggregation. Omit to summarize
   * the entire state.
   */
  readonly filter?: PluginBrowserChangelogFilter;
}

export function summarizePluginBrowserChangelog(
  state: PluginBrowserChangelogState,
  options: SummarizePluginBrowserChangelogOptions = {},
): PluginBrowserChangelogSummary {
  const entries: readonly PluginBrowserChangelogEntry[] = options.filter
    ? filterPluginBrowserChangelog(state, options.filter)
    : state.entries;

  if (entries.length === 0) return emptyPluginBrowserChangelogSummary();

  const byKind = emptyKindCounts();
  const bySeverity = emptySeverityCounts();
  const byPluginId: Record<string, number> = {};

  let firstTimestamp = entries[0].timestamp;
  let lastTimestamp = entries[0].timestamp;

  for (const e of entries) {
    byKind[e.intent.kind] += 1;
    bySeverity[e.intent.severity] += 1;
    byPluginId[e.intent.pluginId] = (byPluginId[e.intent.pluginId] ?? 0) + 1;
    if (e.timestamp < firstTimestamp) firstTimestamp = e.timestamp;
    if (e.timestamp > lastTimestamp) lastTimestamp = e.timestamp;
  }

  return {
    total: entries.length,
    byKind,
    bySeverity,
    byPluginId,
    distinctPluginCount: Object.keys(byPluginId).length,
    firstTimestamp,
    lastTimestamp,
  };
}

/**
 * Convenience: top-N plugins by entry count, ties broken by
 * lexicographic pluginId (stable across refreshes).
 */
export function topPluginsByChangelogActivity(
  summary: PluginBrowserChangelogSummary,
  limit: number,
): readonly { readonly pluginId: string; readonly count: number }[] {
  const cap = Math.max(0, limit | 0);
  if (cap === 0) return [];
  const pairs = Object.entries(summary.byPluginId).map(([pluginId, count]) => ({
    pluginId,
    count,
  }));
  pairs.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.pluginId < b.pluginId ? -1 : a.pluginId > b.pluginId ? 1 : 0;
  });
  return pairs.slice(0, cap);
}
