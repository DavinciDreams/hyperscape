/**
 * Plugin Browser list-view sort comparators.
 *
 * Companion to `PluginBrowserSnapshot`/`PluginBrowserSearch`/
 * `PluginBrowserGroupings`: pure-logic comparator factory for list-
 * view column headers. The Plugin Browser panel can hand the result
 * straight to `Array.prototype.sort` to reorder a row array by the
 * column the user clicked.
 *
 * Scope: sort **already-filtered** rows. It deliberately doesn't
 * re-score or re-filter — `searchPluginBrowser` handles that stage.
 *
 * Design notes:
 *   - `null`-safe: `errorMessage` null goes last on asc, first on
 *     desc (so failing plugins bubble to the top of a "has-error"
 *     sort).
 *   - Stable tie-break: ties always fall back to `id` asc so the
 *     display order is deterministic regardless of input order.
 *   - Case-insensitive string sort via `localeCompare` with
 *     `{sensitivity:"base"}`.
 *   - Lifecycle state is sorted by a canonical severity order rather
 *     than alphabetical — `failed` first (authors want to fix those),
 *     then `enabled`, `disabled`, `loaded`, `registered`. Reversible
 *     via `direction:"desc"` like any other column.
 */

import type { PluginBrowserRow } from "./PluginBrowserSnapshot.js";
import type { PluginLifecycleState } from "./PluginLoader.js";

export type PluginBrowserSortColumn =
  | "id"
  | "name"
  | "version"
  | "author"
  | "state"
  | "enabledByDefault"
  | "dependencyCount"
  | "contributionCount"
  | "errorMessage"
  | "healthIssueCount";

export type PluginBrowserSortDirection = "asc" | "desc";

export interface PluginBrowserSortOrder {
  readonly column: PluginBrowserSortColumn;
  readonly direction: PluginBrowserSortDirection;
}

/**
 * Severity-weighted order for `state` sort. Lower number = earlier on
 * asc. Choosing `failed` first because that's what an operator scans
 * for when a world won't boot; `registered` last because it's the
 * default no-op state.
 */
const STATE_WEIGHTS: Record<PluginLifecycleState, number> = {
  failed: 0,
  enabled: 1,
  disabled: 2,
  loaded: 3,
  registered: 4,
};

function sumContributions(row: PluginBrowserRow): number {
  const c = row.contributions;
  return (
    c.systems +
    c.entities +
    c.widgets +
    c.manifestSchemas +
    c.paletteCategories +
    c.toolbarTools +
    c.commands
  );
}

function cmpString(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/**
 * Produce a comparator suitable for `Array.prototype.sort` that
 * orders `PluginBrowserRow`s by the requested column + direction.
 * Ties always break on `id` asc for deterministic display.
 */
export function buildPluginBrowserComparator(
  order: PluginBrowserSortOrder,
): (a: PluginBrowserRow, b: PluginBrowserRow) => number {
  const dir = order.direction === "desc" ? -1 : 1;
  return (a, b) => {
    const primary = primaryDelta(a, b, order.column);
    if (primary !== 0) return primary * dir;
    // Tie-break: `id` asc, unaffected by direction so the final
    // ordering is stable regardless of the user's chosen direction.
    return cmpString(a.id, b.id);
  };
}

function primaryDelta(
  a: PluginBrowserRow,
  b: PluginBrowserRow,
  column: PluginBrowserSortColumn,
): number {
  switch (column) {
    case "id":
      return cmpString(a.id, b.id);
    case "name":
      return cmpString(a.name, b.name);
    case "version":
      return cmpString(a.version, b.version);
    case "author":
      return cmpString(a.author, b.author);
    case "state":
      return STATE_WEIGHTS[a.state] - STATE_WEIGHTS[b.state];
    case "enabledByDefault":
      return (a.enabledByDefault ? 0 : 1) - (b.enabledByDefault ? 0 : 1);
    case "dependencyCount":
      return a.dependencyIds.length - b.dependencyIds.length;
    case "contributionCount":
      return sumContributions(a) - sumContributions(b);
    case "errorMessage":
      return cmpNullableString(a.errorMessage, b.errorMessage);
    case "healthIssueCount":
      return a.healthIssues.length - b.healthIssues.length;
  }
}

/**
 * Null goes LAST on ascending sort (so rows with error messages
 * bubble to the top when sorting by `errorMessage` asc). Flipping
 * direction to `desc` naturally pushes nulls to the front.
 */
function cmpNullableString(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return cmpString(a, b);
}

/**
 * Convenience wrapper: applies the comparator in place-safe fashion
 * (returns a new array, leaving input untouched). Callers that don't
 * care about input mutation can sort in place via the comparator
 * directly.
 */
export function sortPluginBrowserRows(
  rows: readonly PluginBrowserRow[],
  order: PluginBrowserSortOrder,
): PluginBrowserRow[] {
  return [...rows].sort(buildPluginBrowserComparator(order));
}
