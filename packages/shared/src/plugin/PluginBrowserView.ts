/**
 * Plugin Browser single-call view pipeline.
 *
 * Completes the editor-facing Browser substrate quartet. Composes:
 *
 *   snapshot → searchPluginBrowser (filter + score)
 *            → sortPluginBrowserRows (column sort)
 *            → groupBy… (optional faceting)
 *
 * so the editor panel can call one function per render instead of
 * orchestrating three stages manually. The caller still owns the
 * snapshot build (it needs a `PluginHost` + registry + optional
 * health report) — `buildPluginBrowserView` just composes the
 * transformations downstream of the snapshot.
 *
 * Ordering semantics:
 *   - `query.length > 0` → results ordered by relevance score
 *     (highest first, tie-break on id asc). Sort override is still
 *     respected: caller can opt into a column sort instead of
 *     relevance, e.g. for a list view.
 *   - `query.length === 0` → column sort applied directly. When no
 *     sort override is provided, rows come through in
 *     `searchPluginBrowser`'s default id-asc order.
 *   - Grouping happens last. Within each group, the sort order from
 *     the previous stage is preserved.
 *
 * Why keep these as three separate modules if we're composing them
 * here? Because the editor panel sometimes wants partial pipelines —
 * e.g. a palette-style search that skips grouping, or a sidebar
 * facet tree that skips scoring. The composed entry point is a
 * convenience; the individual stages remain the authoritative API.
 */

import type { PluginBrowserRow } from "./PluginBrowserSnapshot.js";
import {
  type PluginBrowserSearchFilters,
  type ScoredPluginBrowserRow,
  searchPluginBrowser,
} from "./PluginBrowserSearch.js";
import {
  type PluginBrowserSortOrder,
  sortPluginBrowserRows,
} from "./PluginBrowserSortOrder.js";
import {
  type PluginBrowserGroup,
  groupByAuthor,
  groupByState,
  groupByTag,
} from "./PluginBrowserGroupings.js";

export type PluginBrowserGroupMode = "none" | "state" | "author" | "tag";

export interface PluginBrowserViewOptions {
  readonly filters?: PluginBrowserSearchFilters;
  /** Override the filter's score-based order with a column sort. */
  readonly sort?: PluginBrowserSortOrder;
  /** How to group the result. Default: `"none"` (flat). */
  readonly groupMode?: PluginBrowserGroupMode;
  /**
   * When `groupMode === "state"`, whether to include empty state
   * buckets for UI stability. Passed through to `groupByState`.
   */
  readonly includeEmptyStateGroups?: boolean;
}

export type PluginBrowserView =
  | {
      readonly kind: "flat";
      readonly rows: readonly ScoredPluginBrowserRow[];
    }
  | {
      readonly kind: "grouped";
      readonly mode: Exclude<PluginBrowserGroupMode, "none">;
      readonly groups: readonly PluginBrowserGroup[];
      /**
       * Flat row array matching the pre-grouped order, so the editor
       * can fall back to a flat list without recomputing.
       */
      readonly flatRows: readonly PluginBrowserRow[];
    };

/**
 * Single-call composition of the Browser pipeline. Produces either
 * a flat scored array or a grouped bucket list depending on
 * `options.groupMode`.
 */
export function buildPluginBrowserView(
  rows: readonly PluginBrowserRow[],
  options: PluginBrowserViewOptions = {},
): PluginBrowserView {
  const filters = options.filters ?? {};
  const scored = searchPluginBrowser(rows, filters);

  // If the caller provided a sort override, apply it to the already-
  // filtered rows. Otherwise keep the scorer's relevance order for
  // non-empty queries, and its id-asc fallback for empty queries.
  let orderedScored: readonly ScoredPluginBrowserRow[];
  if (options.sort !== undefined) {
    const plain = scored.map((s) => s.row);
    const sorted = sortPluginBrowserRows(plain, options.sort);
    // Re-attach score/matchedField from the pre-sort list.
    const scoreById = new Map(scored.map((s) => [s.row.id, s]));
    orderedScored = sorted.map(
      (r) =>
        scoreById.get(r.id) ?? {
          row: r,
          score: 0,
          matchedField: null,
        },
    );
  } else {
    orderedScored = scored;
  }

  const mode = options.groupMode ?? "none";
  if (mode === "none") {
    return { kind: "flat", rows: orderedScored };
  }

  const flatRows = orderedScored.map((s) => s.row);
  let groups: PluginBrowserGroup[];
  switch (mode) {
    case "state":
      groups = groupByState(flatRows, {
        includeEmptyStates: options.includeEmptyStateGroups,
      });
      break;
    case "author":
      groups = groupByAuthor(flatRows);
      break;
    case "tag":
      groups = groupByTag(flatRows);
      break;
  }

  // Preserve the upstream order within each group: the grouping
  // helpers sort rows by id internally, but the editor often wants
  // to see the score/column order preserved. Re-order each group's
  // rows to match `flatRows` position so clicking a row in the flat
  // list stays visually aligned with the grouped view.
  const positionById = new Map(flatRows.map((r, i) => [r.id, i] as const));
  const alignedGroups = groups.map((g) => ({
    key: g.key,
    rows: [...g.rows].sort((a, b) => {
      const ai = positionById.get(a.id) ?? 0;
      const bi = positionById.get(b.id) ?? 0;
      return ai - bi;
    }),
  }));

  return {
    kind: "grouped",
    mode,
    groups: alignedGroups,
    flatRows,
  };
}
