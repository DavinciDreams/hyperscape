/**
 * Pure column-visibility state for the Plugin Browser list pane.
 * Users can hide columns they don't care about ("I never look at
 * stability, don't waste horizontal pixels on it"), and the state
 * persists across sessions.
 *
 * This module owns only the **visibility map + reordering** — it
 * does not render anything, and it does not know about the rows
 * being displayed. The React header component queries
 * `visibleColumnsInOrder()` and `isColumnVisible(id)` to drive
 * `<th>` emission.
 *
 * Design points:
 *  - Column ids are opaque strings; callers choose them.
 *  - A column declared as `locked: true` cannot be hidden (e.g.
 *    the plugin-id column — hiding it would render an identity-
 *    less row). Attempts to hide a locked column are no-ops.
 *  - A column declared as `defaultHidden: true` starts hidden but
 *    is still user-toggleable.
 *  - Ordering is caller-authored at creation; `reorder(from, to)`
 *    supports drag-and-drop column header rearrangement.
 *  - Unknown column ids passed to any mutator are silently ignored
 *    (no throws) — column sets evolve over time and we don't want
 *    persisted state to crash the editor when a column is removed.
 *
 * Pure state. Caller-owned instance (not a singleton).
 */

export interface PluginBrowserColumnDefinition {
  readonly id: string;
  /** Human-readable label for the column header. */
  readonly label: string;
  /**
   * When true, the column is always visible and can't be hidden by
   * the user. Attempts to hide it are silent no-ops.
   */
  readonly locked?: boolean;
  /**
   * When true, the column starts hidden. Still user-toggleable
   * (unless also `locked`, which would be contradictory; tests
   * resolve this by treating `locked` as dominant — a locked column
   * is always visible).
   */
  readonly defaultHidden?: boolean;
}

export interface PluginBrowserColumnSnapshot {
  readonly id: string;
  readonly label: string;
  readonly visible: boolean;
  readonly locked: boolean;
}

export interface PluginBrowserColumnVisibility {
  /** Number of columns (ever declared). */
  size(): number;
  /** True when the column `id` exists. */
  hasColumn(id: string): boolean;
  /** True when the column is visible (locked columns are always visible). */
  isColumnVisible(id: string): boolean;
  /** Current authored order of all column ids (visible or not). */
  order(): readonly string[];
  /** Subset of `order()` that is currently visible. */
  visibleColumnsInOrder(): readonly string[];
  /** All columns in authored order as snapshot records. */
  snapshot(): readonly PluginBrowserColumnSnapshot[];
  /** Show a column. No-op if unknown. */
  show(id: string): void;
  /** Hide a column. No-op if unknown, locked, or already hidden. */
  hide(id: string): void;
  /** Flip visibility. Hide fails silently on locked columns. */
  toggle(id: string): void;
  /** Make every non-locked column visible. */
  showAll(): void;
  /** Hide every non-locked column. */
  hideAll(): void;
  /** Reset to the `defaultHidden`-derived initial state. */
  reset(): void;
  /**
   * Move a column from `fromIndex` to `toIndex`. Indexes are in
   * the authored-order array. Both endpoints are clamped. No-op
   * when `fromIndex === toIndex` or either is out of range.
   */
  reorder(fromIndex: number, toIndex: number): void;
}

/**
 * Create a new column-visibility manager from a caller-authored
 * definition list. Caller controls the definition order; that
 * becomes the initial column order.
 */
export function createPluginBrowserColumnVisibility(
  columns: readonly PluginBrowserColumnDefinition[],
): PluginBrowserColumnVisibility {
  // Freeze input into our internal records. Copying the array
  // means caller mutations to their own array don't leak in.
  const defs = new Map<string, PluginBrowserColumnDefinition>();
  const initialOrder: string[] = [];
  for (const c of columns) {
    if (defs.has(c.id)) continue; // silently dedupe — last write loses
    defs.set(c.id, c);
    initialOrder.push(c.id);
  }

  const initialVisible = (id: string): boolean => {
    const d = defs.get(id)!;
    if (d.locked) return true;
    return d.defaultHidden !== true;
  };

  const order: string[] = [...initialOrder];
  const visible = new Map<string, boolean>();
  for (const id of order) visible.set(id, initialVisible(id));

  function isLocked(id: string): boolean {
    const d = defs.get(id);
    return d?.locked === true;
  }

  return {
    size(): number {
      return order.length;
    },

    hasColumn(id: string): boolean {
      return defs.has(id);
    },

    isColumnVisible(id: string): boolean {
      if (isLocked(id)) return true;
      return visible.get(id) === true;
    },

    order(): readonly string[] {
      return order.slice();
    },

    visibleColumnsInOrder(): readonly string[] {
      const out: string[] = [];
      for (const id of order) {
        if (isLocked(id) || visible.get(id) === true) out.push(id);
      }
      return out;
    },

    snapshot(): readonly PluginBrowserColumnSnapshot[] {
      return order.map((id) => {
        const d = defs.get(id)!;
        return {
          id,
          label: d.label,
          visible: isLocked(id) || visible.get(id) === true,
          locked: d.locked === true,
        };
      });
    },

    show(id: string): void {
      if (!defs.has(id)) return;
      visible.set(id, true);
    },

    hide(id: string): void {
      if (!defs.has(id)) return;
      if (isLocked(id)) return;
      visible.set(id, false);
    },

    toggle(id: string): void {
      if (!defs.has(id)) return;
      if (isLocked(id)) return; // locked stays visible
      visible.set(id, !(visible.get(id) === true));
    },

    showAll(): void {
      for (const id of order) visible.set(id, true);
    },

    hideAll(): void {
      for (const id of order) {
        if (!isLocked(id)) visible.set(id, false);
      }
    },

    reset(): void {
      // Restore initial order and initial visibility.
      order.length = 0;
      for (const id of initialOrder) order.push(id);
      visible.clear();
      for (const id of order) visible.set(id, initialVisible(id));
    },

    reorder(fromIndex: number, toIndex: number): void {
      if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) return;
      const n = order.length;
      const from = Math.floor(fromIndex);
      const to = Math.floor(toIndex);
      if (from < 0 || from >= n) return;
      if (to < 0 || to >= n) return;
      if (from === to) return;
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
    },
  };
}
