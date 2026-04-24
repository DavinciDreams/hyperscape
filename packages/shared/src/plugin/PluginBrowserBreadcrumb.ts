/**
 * Pure hierarchical breadcrumb path state for the Plugin
 * Browser. Tracks the user's drill-down *category/filter
 * path* — e.g. `All Plugins → Social → Chat → Moderation` —
 * as an ordered list of `PluginBrowserCrumb` segments.
 *
 * Distinct from:
 *   - `PluginBrowserHistoryTracker` — time-ordered back/
 *     forward navigation (not necessarily hierarchical).
 *   - `PluginBrowserSidebarSections` — sidebar tree-view
 *     expansion state.
 *
 * Semantics:
 *   - `push(crumb)` appends a segment.
 *   - `jumpTo(segmentId)` truncates to that segment
 *     (inclusive) — all deeper segments discarded. The
 *     target must already be in the path.
 *   - `root(crumb)` replaces the entire path with a single
 *     segment. Used when the user picks a new top-level
 *     category.
 *   - `pop()` removes the deepest segment.
 *   - Segment ids are unique within a path — `push` rejects
 *     a duplicate id silently.
 *
 * Pure state, caller-owned, never throws. Invalid input
 * silently no-op'd.
 */

export interface PluginBrowserCrumb {
  readonly id: string;
  readonly label: string;
}

export interface PluginBrowserBreadcrumb {
  /** Replace the path with `[crumb]`. Rejects empty id/label. */
  root(crumb: PluginBrowserCrumb): boolean;
  /**
   * Append a crumb. Rejects empty id/label, duplicate id
   * (already in path), or when the path is empty (call
   * `root()` first).
   */
  push(crumb: PluginBrowserCrumb): boolean;
  /** Remove deepest crumb. Returns false if only root remains or empty. */
  pop(): PluginBrowserCrumb | undefined;
  /**
   * Truncate to (and including) `segmentId`. Returns true
   * iff a truncation actually happened (segment found and
   * deeper segments removed). No-op when segment is already
   * the deepest or not in path.
   */
  jumpTo(segmentId: string): boolean;
  /** All crumbs, root-first. */
  path(): readonly PluginBrowserCrumb[];
  /** Deepest crumb, or undefined when empty. */
  tip(): PluginBrowserCrumb | undefined;
  /** Segment count. */
  depth(): number;
  /** True iff `segmentId` is in the path. */
  includes(segmentId: string): boolean;
  /** Wipe the path. */
  clear(): void;
}

function isValidId(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}

function isValidCrumb(c: unknown): c is PluginBrowserCrumb {
  if (typeof c !== "object" || c === null) return false;
  const o = c as { id?: unknown; label?: unknown };
  return isValidId(o.id) && isValidId(o.label);
}

/**
 * Create a caller-owned breadcrumb path.
 */
export function createPluginBrowserBreadcrumb(): PluginBrowserBreadcrumb {
  const path: PluginBrowserCrumb[] = [];

  function findIndex(segmentId: string): number {
    for (let i = 0; i < path.length; i++) {
      if (path[i].id === segmentId) return i;
    }
    return -1;
  }

  return {
    root(crumb: PluginBrowserCrumb): boolean {
      if (!isValidCrumb(crumb)) return false;
      path.length = 0;
      path.push({ id: crumb.id, label: crumb.label });
      return true;
    },
    push(crumb: PluginBrowserCrumb): boolean {
      if (!isValidCrumb(crumb)) return false;
      if (path.length === 0) return false;
      if (findIndex(crumb.id) >= 0) return false;
      path.push({ id: crumb.id, label: crumb.label });
      return true;
    },
    pop(): PluginBrowserCrumb | undefined {
      if (path.length <= 1) return undefined;
      return path.pop();
    },
    jumpTo(segmentId: string): boolean {
      if (!isValidId(segmentId)) return false;
      const idx = findIndex(segmentId);
      if (idx < 0) return false;
      if (idx === path.length - 1) return false;
      path.length = idx + 1;
      return true;
    },
    path(): readonly PluginBrowserCrumb[] {
      return path.slice();
    },
    tip(): PluginBrowserCrumb | undefined {
      return path.length === 0 ? undefined : path[path.length - 1];
    },
    depth(): number {
      return path.length;
    },
    includes(segmentId: string): boolean {
      if (!isValidId(segmentId)) return false;
      return findIndex(segmentId) >= 0;
    },
    clear(): void {
      path.length = 0;
    },
  };
}
