/**
 * Composite projection that builds the **list-pane view model** for
 * the Plugin Browser: the ordered, filtered, scored flat entry list
 * the editor renders in the main table.
 *
 * This is the list-pane twin of
 * {@link buildPluginBrowserDetailsViewModel}. Its job is to collapse
 * every upstream list-level primitive — severity filter, search,
 * sort — into a single deterministic call the React view can consume
 * without additional logic.
 *
 * Upstream primitives composed here:
 *  - {@link filterPluginBrowserRowsBySeverity} — drop rows whose
 *    severity isn't in the include set / is in the exclude set.
 *  - {@link searchPluginBrowserRows} — tiered-substring scoring.
 *    When a non-empty query is present, rows are ordered by score
 *    descending (input order as tiebreak) and zero-score rows are
 *    dropped. When the query is empty, ordering is left to the
 *    severity/sort path.
 *  - {@link sortPluginBrowserRowSummaries} — stable comparator-based
 *    sort. Applied **only when no search query is in effect**, so
 *    a query never fights the relevance ranking.
 *
 * Selection is overlaid last: the entry for the currently-selected
 * plugin id (if any) gets `isSelected: true`.
 *
 * Pure transforms. Never throws. Empty snapshot yields an empty
 * list (never a placeholder row).
 */

import type { PluginBrowserState } from "./PluginBrowserReducer.js";
import type { PluginBrowserRowSummary } from "./PluginBrowserRowSummary.js";
import type { PluginBrowserSeverityFilter } from "./PluginBrowserSeverityFilter.js";
import { filterPluginBrowserRowsBySeverity } from "./PluginBrowserSeverityFilter.js";
import type { PluginBrowserRowSortOrder } from "./PluginBrowserRowSort.js";
import { sortPluginBrowserRowSummaries } from "./PluginBrowserRowSort.js";
import {
  searchPluginBrowserRows,
  type PluginBrowserSearchMatch,
} from "./PluginBrowserSearchIndex.js";

/**
 * One row in the rendered list pane. The row itself, the match score
 * (0 when no search query is active), and whether the row is the
 * currently-selected plugin.
 */
export interface PluginBrowserListEntry {
  readonly row: PluginBrowserRowSummary;
  /**
   * Score in `[0, 100]`. Always 0 when no search query is active.
   * Callers can use this to highlight matched cells.
   */
  readonly score: number;
  /** True when this row's `pluginId` equals `state.selectedPluginId`. */
  readonly isSelected: boolean;
}

export interface PluginBrowserListViewModel {
  readonly entries: readonly PluginBrowserListEntry[];
  /**
   * Total rows in the source snapshot, before filter/search.
   * Useful for rendering "showing N of M" counters.
   */
  readonly totalCount: number;
  /** `entries.length` — rows the view will actually render. */
  readonly visibleCount: number;
  /** True when a non-empty, trimmed search query is in effect. */
  readonly hasSearchQuery: boolean;
  /** Normalized search query (trimmed). Empty string when none. */
  readonly searchQuery: string;
}

export interface BuildPluginBrowserListViewModelOptions {
  /**
   * Raw user query (will be trimmed). Empty/whitespace means "no
   * query" and yields the pre-search ordering.
   */
  readonly searchQuery?: string;
  /**
   * Optional severity include/exclude set. Empty filter = pass-through.
   */
  readonly severityFilter?: PluginBrowserSeverityFilter;
  /**
   * Optional column sort. **Ignored when a non-empty search query is
   * active** so relevance ranking wins.
   */
  readonly sortOrder?: PluginBrowserRowSortOrder;
}

const EMPTY_ENTRIES: readonly PluginBrowserListEntry[] = Object.freeze([]);

/**
 * Build the list-pane view model. Returns a pre-computed flat list
 * ready for React rendering. The input `state` is not mutated; the
 * result is a fresh object with frozen sub-arrays.
 */
export function buildPluginBrowserListViewModel(
  state: PluginBrowserState,
  options: BuildPluginBrowserListViewModelOptions = {},
): PluginBrowserListViewModel {
  const totalCount = state.currentSnapshot.size;
  const normalizedQuery = (options.searchQuery ?? "").trim();
  const hasSearchQuery = normalizedQuery.length > 0;

  if (totalCount === 0) {
    return {
      entries: EMPTY_ENTRIES,
      totalCount: 0,
      visibleCount: 0,
      hasSearchQuery,
      searchQuery: normalizedQuery,
    };
  }

  // 1) Severity filter first — collapses the source map, preserves
  // insertion order.
  const filteredMap = filterPluginBrowserRowsBySeverity(
    state.currentSnapshot,
    options.severityFilter,
  );

  // If nothing passes severity, short-circuit.
  if (filteredMap.size === 0) {
    return {
      entries: EMPTY_ENTRIES,
      totalCount,
      visibleCount: 0,
      hasSearchQuery,
      searchQuery: normalizedQuery,
    };
  }

  const filteredRows: PluginBrowserRowSummary[] = Array.from(
    filteredMap.values(),
  );

  // 2) Search vs sort — exactly one wins the ordering.
  let ordered: readonly PluginBrowserRowSummary[];
  let scoreByPluginId: ReadonlyMap<string, number>;

  if (hasSearchQuery) {
    const matches: readonly PluginBrowserSearchMatch[] =
      searchPluginBrowserRows(filteredRows, normalizedQuery);
    // Build score lookup + ordered rows from matches. Zero-score rows
    // have already been dropped by searchPluginBrowserRows.
    const scoreMap = new Map<string, number>();
    const rowList: PluginBrowserRowSummary[] = [];
    for (const m of matches) {
      scoreMap.set(m.row.pluginId, m.score);
      rowList.push(m.row);
    }
    ordered = rowList;
    scoreByPluginId = scoreMap;
  } else if (options.sortOrder) {
    ordered = sortPluginBrowserRowSummaries(filteredRows, options.sortOrder);
    scoreByPluginId = EMPTY_SCORE_MAP;
  } else {
    ordered = filteredRows;
    scoreByPluginId = EMPTY_SCORE_MAP;
  }

  // 3) Overlay selection. No extra allocation if selection is null —
  // we still have to build one entry per row regardless.
  const selectedId = state.selectedPluginId;
  const entries: PluginBrowserListEntry[] = [];
  for (const row of ordered) {
    entries.push({
      row,
      score: scoreByPluginId.get(row.pluginId) ?? 0,
      isSelected: selectedId !== null && row.pluginId === selectedId,
    });
  }

  return {
    entries,
    totalCount,
    visibleCount: entries.length,
    hasSearchQuery,
    searchQuery: normalizedQuery,
  };
}

const EMPTY_SCORE_MAP: ReadonlyMap<string, number> = new Map();
