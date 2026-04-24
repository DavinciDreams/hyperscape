/**
 * Pure selector functions over a {@link PluginBrowserState}.
 *
 * React components in the Plugin Browser editor panel feed their
 * reducer state into these selectors to produce render-ready shapes
 * without copy-pasting derivation logic into view code. Every
 * selector is a pure function of its inputs — no memoization, no
 * closures over module-level state — so callers can wrap them with
 * `useMemo`/`reselect`/anything equivalent as needed.
 *
 * Selectors never mutate the input state. Every returned array or
 * map is either a fresh allocation or a reference from the input
 * (for no-op fast paths).
 *
 * Pure transforms. Never throw.
 */

import type { PluginBrowserChangelogSummary } from "./PluginBrowserChangelogSummary.js";
import { summarizePluginBrowserChangelog } from "./PluginBrowserChangelogSummary.js";
import type { PluginBrowserChangelogView } from "./PluginBrowserChangelogView.js";
import { renderPluginBrowserChangelogView } from "./PluginBrowserChangelogView.js";
import type { PluginBrowserChangelogUnreadReport } from "./PluginBrowserChangelogCursor.js";
import { unreadPluginBrowserChangelog } from "./PluginBrowserChangelogCursor.js";
import type { PluginBrowserState } from "./PluginBrowserReducer.js";
import type { PluginBrowserRowSortOrder } from "./PluginBrowserRowSort.js";
import {
  sortPluginBrowserRowSummaries,
  sortPluginBrowserRowSummariesByWorstFirst,
} from "./PluginBrowserRowSort.js";
import type {
  PluginBrowserRowSummary,
  PluginRowSummarySeverity,
} from "./PluginBrowserRowSummary.js";
import type { PluginBrowserSeverityFilter } from "./PluginBrowserSeverityFilter.js";
import { filterPluginBrowserRowsBySeverity } from "./PluginBrowserSeverityFilter.js";

/** Per-severity count tally for header badges. */
export interface PluginBrowserSeverityCounts {
  readonly ok: number;
  readonly info: number;
  readonly warning: number;
  readonly error: number;
  readonly total: number;
}

/** Options for {@link selectVisibleRows}. */
export interface SelectVisibleRowsOptions {
  readonly severityFilter?: PluginBrowserSeverityFilter;
  /**
   * Sort order. When omitted, falls back to worst-severity-first
   * (the default column-order the editor paints on first render).
   */
  readonly sort?: PluginBrowserRowSortOrder;
}

/**
 * Snapshot Map → ordered array. Preserves insertion order of the
 * snapshot Map (JS Map iteration is insertion-ordered).
 */
export function selectRowArray(
  state: PluginBrowserState,
): readonly PluginBrowserRowSummary[] {
  const out: PluginBrowserRowSummary[] = [];
  for (const row of state.currentSnapshot.values()) out.push(row);
  return out;
}

/**
 * Look up a row by plugin id. Returns `null` if the id is not in
 * the current snapshot.
 */
export function selectRowById(
  state: PluginBrowserState,
  pluginId: string,
): PluginBrowserRowSummary | null {
  return state.currentSnapshot.get(pluginId) ?? null;
}

/**
 * Resolve the currently selected row. Returns `null` both when no
 * plugin is selected AND when the selected plugin id no longer
 * exists in the snapshot (stale selection).
 */
export function selectSelectedRow(
  state: PluginBrowserState,
): PluginBrowserRowSummary | null {
  if (state.selectedPluginId === null) return null;
  return state.currentSnapshot.get(state.selectedPluginId) ?? null;
}

/**
 * Is the selected plugin id still present in the snapshot?
 * Distinguishes "no selection" from "stale selection" — which a
 * thin reducer consumer may want to surface differently
 * (e.g. auto-clear vs keep placeholder).
 */
export function selectHasStaleSelection(state: PluginBrowserState): boolean {
  if (state.selectedPluginId === null) return false;
  return !state.currentSnapshot.has(state.selectedPluginId);
}

/**
 * Tally counts per severity across the current snapshot. Keys are
 * always present, defaulting to zero; `total` is the sum. Useful
 * for header-badge displays (e.g. "3 errors · 2 warnings").
 */
export function selectSeverityCounts(
  state: PluginBrowserState,
): PluginBrowserSeverityCounts {
  let ok = 0;
  let info = 0;
  let warning = 0;
  let error = 0;
  for (const row of state.currentSnapshot.values()) {
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
  }
  return {
    ok,
    info,
    warning,
    error,
    total: ok + info + warning + error,
  };
}

/**
 * Filtered + sorted row list for the main table. Filtering runs
 * before sorting; when no options are provided, the result is the
 * full snapshot sorted worst-first.
 */
export function selectVisibleRows(
  state: PluginBrowserState,
  options: SelectVisibleRowsOptions = {},
): readonly PluginBrowserRowSummary[] {
  const filtered = filterPluginBrowserRowsBySeverity(
    state.currentSnapshot,
    options.severityFilter,
  );
  const rows: PluginBrowserRowSummary[] = [];
  for (const row of filtered.values()) rows.push(row);
  if (options.sort) {
    return sortPluginBrowserRowSummaries(rows, options.sort);
  }
  return sortPluginBrowserRowSummariesByWorstFirst(rows);
}

/**
 * Unread changelog report derived from the state's changelog +
 * cursor. Equivalent to calling
 * `unreadPluginBrowserChangelog(state.changelog, state.cursor)`;
 * provided here for parity with other selectors so the editor can
 * go through a single import surface.
 */
export function selectUnreadChangelog(
  state: PluginBrowserState,
): PluginBrowserChangelogUnreadReport {
  return unreadPluginBrowserChangelog(state.changelog, state.cursor);
}

/**
 * Convenience: is there at least one unread changelog entry?
 */
export function selectHasUnreadChangelog(state: PluginBrowserState): boolean {
  return selectUnreadChangelog(state).unreadCount > 0;
}

/**
 * Worst unread severity, or `null` when no unread entries exist.
 * Drives the top-level changelog-tab tint.
 */
export function selectUnreadWorstSeverity(
  state: PluginBrowserState,
): PluginRowSummarySeverity | null {
  return selectUnreadChangelog(state).worstSeverity;
}

/**
 * Summary projection over the full changelog. Thin wrapper that
 * threads the reducer's changelog into
 * {@link summarizePluginBrowserChangelog}.
 */
export function selectChangelogSummary(
  state: PluginBrowserState,
): PluginBrowserChangelogSummary {
  return summarizePluginBrowserChangelog(state.changelog);
}

/**
 * Render-ready grouped changelog view. Defaults to newest-first so
 * the changelog tab opens at the latest activity. Passes through
 * the entire changelog array.
 */
export function selectChangelogView(
  state: PluginBrowserState,
  opts: { readonly newestFirst?: boolean } = {},
): PluginBrowserChangelogView {
  return renderPluginBrowserChangelogView(state.changelog.entries, opts);
}

/**
 * Overall toast surface count (visible displays plus the overflow
 * group's hidden count, when present). Matches what the live
 * toast surface is showing.
 */
export function selectToastSurfaceCount(state: PluginBrowserState): number {
  const overflow = state.overflow;
  return state.displays.length + (overflow ? overflow.count : 0);
}
