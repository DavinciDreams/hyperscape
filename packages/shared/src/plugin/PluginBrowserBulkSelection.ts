/**
 * Pure multi-select set management for the Plugin Browser's
 * bulk-operation UX (shift-click range, ctrl-click toggle, select
 * all, clear).
 *
 * Owns two pieces of state:
 *  - A set of currently-selected plugin ids (insertion-ordered)
 *  - An "anchor" id used as the pivot point for range selection
 *    (mirrors OS file-manager semantics: `toggle` / `selectOnly`
 *    reset the anchor; `selectRange` pivots around it)
 *
 * Stateful factory — caller owns the returned instance. Pure logic,
 * no side effects beyond the selection's own state. Never throws.
 * Range operations are tolerant: if the anchor or target id is not
 * in the provided `orderedIds`, the operation is a no-op (no throw).
 */

export interface PluginBrowserBulkSelection {
  /**
   * Flip membership of `pluginId`. Sets the anchor to `pluginId`.
   * After toggling on, `pluginId` becomes the most recent entry.
   */
  toggle(pluginId: string): void;
  /**
   * Replace the entire selection with just `pluginId` and set the
   * anchor to `pluginId`. Standard single-click semantics.
   */
  selectOnly(pluginId: string): void;
  /**
   * Replace the selection with `[anchor..pluginId]` (inclusive)
   * ordered according to `orderedIds`. Does NOT move the anchor.
   * No-op when either endpoint is missing from `orderedIds` or
   * when there is no anchor yet (caller should fall back to
   * `selectOnly` in that case, but this method tolerates it).
   */
  selectRange(orderedIds: readonly string[], pluginId: string): void;
  /** Add every id in `orderedIds` to the selection (dedup). */
  selectAll(orderedIds: readonly string[]): void;
  /** Empty the selection and clear the anchor. */
  clear(): void;
  /** True iff `pluginId` is currently selected. */
  isSelected(pluginId: string): boolean;
  /** Count of selected ids. */
  size(): number;
  /** Insertion-ordered snapshot of selected ids (fresh array). */
  ids(): readonly string[];
  /** Current anchor, or `null` if none. */
  anchor(): string | null;
}

/**
 * Construct a pure-logic bulk-selection instance. The returned
 * object mutates its own internal state in place — callers should
 * treat it as a stateful manager, typically stored alongside the
 * `PluginBrowserStore`.
 */
export function createPluginBrowserBulkSelection(): PluginBrowserBulkSelection {
  // Use a Set for O(1) membership + insertion-order stability.
  const selected = new Set<string>();
  let anchorId: string | null = null;

  function toggle(pluginId: string): void {
    if (selected.has(pluginId)) {
      selected.delete(pluginId);
    } else {
      selected.add(pluginId);
    }
    anchorId = pluginId;
  }

  function selectOnly(pluginId: string): void {
    selected.clear();
    selected.add(pluginId);
    anchorId = pluginId;
  }

  function selectRange(orderedIds: readonly string[], pluginId: string): void {
    if (anchorId === null) return;
    const anchorIndex = orderedIds.indexOf(anchorId);
    const targetIndex = orderedIds.indexOf(pluginId);
    if (anchorIndex < 0 || targetIndex < 0) return;

    const [lo, hi] =
      anchorIndex <= targetIndex
        ? [anchorIndex, targetIndex]
        : [targetIndex, anchorIndex];

    selected.clear();
    for (let i = lo; i <= hi; i += 1) {
      selected.add(orderedIds[i]);
    }
    // Anchor is deliberately not moved — shift-click range in OS
    // file managers keeps the original anchor for further ranges.
  }

  function selectAll(orderedIds: readonly string[]): void {
    for (const id of orderedIds) {
      selected.add(id);
    }
    if (orderedIds.length > 0) {
      // Land the anchor on the last selected id, matching
      // "select-all then extend" intent.
      anchorId = orderedIds[orderedIds.length - 1];
    }
  }

  function clear(): void {
    selected.clear();
    anchorId = null;
  }

  function isSelected(pluginId: string): boolean {
    return selected.has(pluginId);
  }

  function size(): number {
    return selected.size;
  }

  function ids(): readonly string[] {
    return Array.from(selected);
  }

  function anchor(): string | null {
    return anchorId;
  }

  return {
    toggle,
    selectOnly,
    selectRange,
    selectAll,
    clear,
    isSelected,
    size,
    ids,
    anchor,
  };
}
