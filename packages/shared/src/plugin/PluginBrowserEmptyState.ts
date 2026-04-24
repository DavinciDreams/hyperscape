/**
 * Pure helper that classifies the **reason** a Plugin Browser list
 * pane is empty. The list view model can compute `visibleCount === 0`
 * but can't tell the difference between:
 *
 *  - no plugins installed at all (the fresh-install case)
 *  - a search query with no matches
 *  - a severity filter that removed everything
 *  - a severity filter AND a search query, both of which contributed
 *    to the empty result
 *
 * The React empty-state panel wants to render a different message
 * per case ("You haven't installed any plugins yet" vs "No plugins
 * match 'com.foo'" vs "No plugins with severity: error" vs "No
 * plugins match 'com.foo' with severity: error"). Doing the reason
 * analysis inside the component would scatter the logic; doing it
 * here keeps a single tested path.
 *
 * Pure transform. Never throws. Returns `null` when the list is
 * non-empty — caller can short-circuit on that.
 */

import type { PluginBrowserListViewModel } from "./PluginBrowserListViewModel.js";
import type { PluginBrowserSeverityFilter } from "./PluginBrowserSeverityFilter.js";

/**
 * Which axes contributed to the empty result. `snapshotEmpty` is
 * terminal — no other axis matters when there are zero source rows.
 * The other three are additive: a caller can present, e.g., "No
 * matches with severity filter active".
 */
export type PluginBrowserEmptyStateKind =
  | "snapshotEmpty"
  | "searchOnly"
  | "severityOnly"
  | "searchAndSeverity";

export interface PluginBrowserEmptyState {
  readonly kind: PluginBrowserEmptyStateKind;
  /** True when a trimmed, non-empty search query was in effect. */
  readonly hasSearchQuery: boolean;
  /**
   * True when the severity filter is actually narrowing (either
   * include or exclude is non-empty).
   */
  readonly hasSeverityFilter: boolean;
  /**
   * Normalized search query the caller can echo into the message
   * ("No plugins match 'X'"). Empty string when no query.
   */
  readonly searchQuery: string;
}

/**
 * Compute the empty-state descriptor for a list view model. Returns
 * `null` when the list has any entries at all — callers should
 * render the normal list in that case.
 */
export function computePluginBrowserEmptyState(
  viewModel: PluginBrowserListViewModel,
  severityFilter?: PluginBrowserSeverityFilter,
): PluginBrowserEmptyState | null {
  if (viewModel.visibleCount > 0) return null;

  const searchQuery = viewModel.searchQuery;
  const hasSearchQuery = viewModel.hasSearchQuery;
  const hasSeverityFilter = isSeverityFilterActive(severityFilter);

  // Terminal case first: no source rows at all. Don't care about
  // filter/search.
  if (viewModel.totalCount === 0) {
    return {
      kind: "snapshotEmpty",
      hasSearchQuery,
      hasSeverityFilter,
      searchQuery,
    };
  }

  if (hasSearchQuery && hasSeverityFilter) {
    return {
      kind: "searchAndSeverity",
      hasSearchQuery: true,
      hasSeverityFilter: true,
      searchQuery,
    };
  }
  if (hasSearchQuery) {
    return {
      kind: "searchOnly",
      hasSearchQuery: true,
      hasSeverityFilter: false,
      searchQuery,
    };
  }
  if (hasSeverityFilter) {
    return {
      kind: "severityOnly",
      hasSearchQuery: false,
      hasSeverityFilter: true,
      searchQuery: "",
    };
  }

  // No query, no filter, but list is empty and snapshot is not —
  // this should be unreachable given the list view model contract
  // (insertion-order pass-through). Fall back to snapshotEmpty so
  // we still render *something*.
  return {
    kind: "snapshotEmpty",
    hasSearchQuery: false,
    hasSeverityFilter: false,
    searchQuery: "",
  };
}

function isSeverityFilterActive(
  filter: PluginBrowserSeverityFilter | undefined,
): boolean {
  if (!filter) return false;
  const includeActive = filter.include !== undefined && filter.include.size > 0;
  const excludeActive = filter.exclude !== undefined && filter.exclude.size > 0;
  return includeActive || excludeActive;
}
