/**
 * Pure pagination window helper for the Plugin Browser list pane.
 * Translates `(totalCount, pageSize, currentPage)` into concrete
 * slice bounds + page-navigation metadata (hasPrev / hasNext /
 * isFirst / isLast / pageCount) the React pager can render
 * without any arithmetic of its own.
 *
 * This is orthogonal to {@link buildPluginBrowserListViewModel} —
 * the view-model returns *every* matching row; the React pager
 * then calls {@link computePluginBrowserPageWindow} to decide which
 * slice to actually paint. We keep this pure so page math stays
 * testable in isolation: off-by-ones around the last partial page
 * are notorious bug-magnets.
 *
 * Pure transform. Never throws. Defensive clamping for all inputs
 * (negative `totalCount`, zero/negative `pageSize`, out-of-range
 * `currentPage`) so the React pager can forward raw user state.
 */

export interface PluginBrowserPageWindow {
  /** Inclusive start index (0-based) into the source list. */
  readonly startIndex: number;
  /** Exclusive end index into the source list. */
  readonly endIndex: number;
  /** Count of entries in the window = endIndex - startIndex. */
  readonly count: number;
  /** 0-based current page, clamped to [0, pageCount - 1]. */
  readonly currentPage: number;
  /** Total page count, at least 1 (empty input → 1 empty page). */
  readonly pageCount: number;
  /** Page size actually used (clamped to ≥ 1). */
  readonly pageSize: number;
  /** True when `currentPage === 0`. */
  readonly isFirstPage: boolean;
  /** True when `currentPage === pageCount - 1`. */
  readonly isLastPage: boolean;
  /** `!isFirstPage`. */
  readonly hasPrev: boolean;
  /** `!isLastPage`. */
  readonly hasNext: boolean;
  /**
   * True when the caller's `currentPage` was out-of-range and had
   * to be clamped. Useful when the list shrinks under the pager
   * (e.g. a filter is applied) so the React pager can jump the
   * user back to a valid page silently.
   */
  readonly wasClamped: boolean;
}

export interface ComputePluginBrowserPageWindowInput {
  /** Total rows available. Negatives clamped to 0. */
  readonly totalCount: number;
  /**
   * Requested 0-based page. Negatives clamp to 0, overshoots clamp
   * to the last page.
   */
  readonly currentPage: number;
  /** Desired rows per page. Clamped to ≥ 1. */
  readonly pageSize: number;
}

/** Default page size if the caller hasn't picked one yet. */
export const DEFAULT_PLUGIN_BROWSER_PAGE_SIZE = 50;

/**
 * Compute the window + metadata for a pagination request. Always
 * returns a valid window even for pathological inputs (0 rows, 0
 * page size, negative page, etc.).
 */
export function computePluginBrowserPageWindow(
  input: ComputePluginBrowserPageWindowInput,
): PluginBrowserPageWindow {
  const totalCount = Math.max(0, Math.floor(input.totalCount));
  const pageSize = Math.max(1, Math.floor(input.pageSize));

  // pageCount is at least 1 so the "empty page 0" state is always
  // representable. This matches how list UIs typically render:
  // show page 1/1 even when there are no rows.
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  const requested = Math.floor(input.currentPage);
  let currentPage: number;
  let wasClamped = false;
  if (!Number.isFinite(requested) || requested < 0) {
    currentPage = 0;
    wasClamped = requested !== 0;
  } else if (requested >= pageCount) {
    currentPage = pageCount - 1;
    wasClamped = true;
  } else {
    currentPage = requested;
  }

  const startIndex = Math.min(currentPage * pageSize, totalCount);
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const count = endIndex - startIndex;

  const isFirstPage = currentPage === 0;
  const isLastPage = currentPage === pageCount - 1;

  return {
    startIndex,
    endIndex,
    count,
    currentPage,
    pageCount,
    pageSize,
    isFirstPage,
    isLastPage,
    hasPrev: !isFirstPage,
    hasNext: !isLastPage,
    wasClamped,
  };
}

/**
 * Convenience: slice an array according to a page window. Returns
 * a fresh (non-frozen) array so callers can mutate if they want.
 * Works with any readonly array shape — ergonomic sibling of
 * {@link computePluginBrowserPageWindow} so callers don't
 * re-import `Array.slice` with the same bounds everywhere.
 */
export function slicePluginBrowserPage<T>(
  entries: readonly T[],
  window: PluginBrowserPageWindow,
): T[] {
  return entries.slice(window.startIndex, window.endIndex);
}
