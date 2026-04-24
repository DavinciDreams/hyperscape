/**
 * Pure column-order state for the Plugin Browser. Drives the
 * left-to-right order of columns when the user drags a header
 * to reorder them.
 *
 * Orthogonal to the other column state modules:
 * - {@link PluginBrowserColumnVisibility} — hide/show.
 * - {@link PluginBrowserColumnWidths}     — px width per column.
 * - {@link PluginBrowserColumnPinning}    — left/right stickiness.
 * - {@link PluginBrowserColumnSearch}     — per-column query.
 *
 * This module decides the authored *sequence* only. Pinning
 * overlays render order (left-pinned first, right-pinned last);
 * this module decides the within-group sequence.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Unknown / empty ids are silent no-ops. Invalid indices
 * are clamped into range.
 */

export interface PluginBrowserColumnOrderDefinition {
  /** Stable column id — matches visibility/widths/pinning ids. */
  readonly id: string;
}

export interface PluginBrowserColumnOrderOptions {
  /**
   * Authored column definitions. Sets the initial order.
   * Duplicates silently deduped (first wins). Empty ids dropped.
   */
  readonly columns: readonly PluginBrowserColumnOrderDefinition[];
  /**
   * Optional persisted order override. Ids not in `columns`
   * are ignored. Columns missing from the override are
   * appended after the override in authored order.
   */
  readonly initialOrder?: readonly string[];
}

export interface PluginBrowserColumnOrder {
  /** Known column ids, in the authored baseline order. */
  authoredIds(): readonly string[];
  /** Current order (after any move/reset calls). */
  orderedIds(): readonly string[];
  /** Current index of `id`, or `-1` when unknown. */
  indexOf(id: string): number;
  /**
   * Move `id` to `newIndex`. `newIndex` is clamped into
   * `[0, count-1]`. Unknown / empty ids are no-ops.
   */
  move(id: string, newIndex: number): void;
  /**
   * Move `id` one slot toward the start. No-op when already
   * first or unknown.
   */
  moveUp(id: string): void;
  /**
   * Move `id` one slot toward the end. No-op when already
   * last or unknown.
   */
  moveDown(id: string): void;
  /** Reset to authored order. */
  reset(): void;
}

function dedupeAuthored(
  columns: readonly PluginBrowserColumnOrderDefinition[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const col of columns) {
    if (typeof col.id !== "string" || col.id.length === 0 || seen.has(col.id)) {
      continue;
    }
    seen.add(col.id);
    out.push(col.id);
  }
  return out;
}

function projectInitialOrder(
  authored: readonly string[],
  initial: readonly string[],
): string[] {
  const authoredSet = new Set(authored);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of initial) {
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      !authoredSet.has(id) ||
      seen.has(id)
    ) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  for (const id of authored) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

/**
 * Create a caller-owned column-order state machine.
 */
export function createPluginBrowserColumnOrder(
  options: PluginBrowserColumnOrderOptions,
): PluginBrowserColumnOrder {
  const authored = dedupeAuthored(options.columns);
  let order: string[] =
    options.initialOrder && options.initialOrder.length > 0
      ? projectInitialOrder(authored, options.initialOrder)
      : [...authored];

  function clampIndex(i: number): number {
    if (!Number.isFinite(i)) return 0;
    const n = order.length;
    if (n === 0) return 0;
    const k = Math.trunc(i);
    if (k < 0) return 0;
    if (k > n - 1) return n - 1;
    return k;
  }

  function moveImpl(id: string, newIndex: number): void {
    if (typeof id !== "string" || id.length === 0) return;
    const from = order.indexOf(id);
    if (from === -1) return;
    const to = clampIndex(newIndex);
    if (to === from) return;
    const next = order.slice();
    next.splice(from, 1);
    next.splice(to, 0, id);
    order = next;
  }

  return {
    authoredIds(): readonly string[] {
      return [...authored];
    },
    orderedIds(): readonly string[] {
      return [...order];
    },
    indexOf(id: string): number {
      if (typeof id !== "string" || id.length === 0) return -1;
      return order.indexOf(id);
    },
    move(id: string, newIndex: number): void {
      moveImpl(id, newIndex);
    },
    moveUp(id: string): void {
      if (typeof id !== "string" || id.length === 0) return;
      const i = order.indexOf(id);
      if (i <= 0) return;
      moveImpl(id, i - 1);
    },
    moveDown(id: string): void {
      if (typeof id !== "string" || id.length === 0) return;
      const i = order.indexOf(id);
      if (i === -1 || i >= order.length - 1) return;
      moveImpl(id, i + 1);
    },
    reset(): void {
      order = [...authored];
    },
  };
}
