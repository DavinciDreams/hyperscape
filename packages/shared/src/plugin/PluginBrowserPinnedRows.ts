/**
 * Pure row-pinning state for the Plugin Browser list pane.
 * Rows pinned here render stuck to the top of the grid (above
 * the normal sorted/filtered flow) so the user always sees
 * the plugins they care about. Orthogonal to
 * {@link PluginBrowserColumnPinning} (which pins *columns*).
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws.
 *
 * Design notes:
 * - Pin order is user-authored: the first pin is at the top.
 * - An optional `capacity` imposes a simple FIFO limit — the
 *   oldest pin evicts when a new pin would exceed the cap.
 * - Re-pinning an already-pinned row is a no-op (does NOT
 *   promote it to the head). Use `reorder` to change order.
 * - Unknown / empty ids are silent no-ops everywhere.
 */

export interface PluginBrowserPinnedRowsOptions {
  /**
   * Initial set of pinned ids, in pin order (first = top).
   * Duplicates are silently deduped; empty strings dropped.
   */
  readonly initialPinned?: readonly string[];
  /**
   * Maximum number of pinned rows. Omit for unlimited.
   * `0` disables pinning entirely (all writes are no-ops).
   * Non-finite / negative values fall back to unlimited.
   */
  readonly capacity?: number;
}

export interface PluginBrowserPinnedRows {
  /** Number of currently pinned rows. */
  size(): number;
  /**
   * Configured capacity. `Infinity` means unlimited;
   * `0` means pinning is disabled. Read-only; set at
   * creation.
   */
  capacity(): number;
  /** True when `rowId` is currently pinned. */
  isPinned(rowId: string): boolean;
  /**
   * Pin a row. When the row is already pinned, the call is
   * a no-op (order is preserved — use {@link reorder} to
   * change position). At-capacity, evicts the oldest pin to
   * make room. Returns `true` when a pin state change
   * occurred, `false` otherwise.
   */
  pin(rowId: string): boolean;
  /**
   * Unpin a row. Unknown / already-unpinned ids are no-ops.
   * Returns `true` when a change occurred.
   */
  unpin(rowId: string): boolean;
  /** Flip the current pin state. */
  togglePin(rowId: string): void;
  /** Unpin every row. */
  unpinAll(): void;
  /**
   * Move a pinned row to `newIndex` (clamped to
   * `[0, size-1]`). Unknown / unpinned ids are silent
   * no-ops. Non-finite indexes silent no-op.
   */
  reorder(rowId: string, newIndex: number): void;
  /** Pinned ids, in pin order (top first). */
  pinnedIds(): readonly string[];
}

function normalizeCapacity(raw: number | undefined): number {
  if (raw === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(raw) || raw < 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor(raw);
}

/**
 * Create a caller-owned pinned-rows manager.
 */
export function createPluginBrowserPinnedRows(
  options: PluginBrowserPinnedRowsOptions = {},
): PluginBrowserPinnedRows {
  const capacity = normalizeCapacity(options.capacity);

  const order: string[] = [];
  const set = new Set<string>();

  if (capacity > 0 && options.initialPinned) {
    for (const id of options.initialPinned) {
      if (typeof id !== "string" || id.length === 0) continue;
      if (set.has(id)) continue; // dedupe — first wins
      order.push(id);
      set.add(id);
      if (order.length >= capacity) break;
    }
  }

  function pinImpl(rowId: string): boolean {
    if (typeof rowId !== "string" || rowId.length === 0) {
      return false;
    }
    if (capacity === 0) return false;
    if (set.has(rowId)) return false;
    while (order.length >= capacity) {
      const victim = order.shift();
      if (victim === undefined) break;
      set.delete(victim);
    }
    order.push(rowId);
    set.add(rowId);
    return true;
  }

  function unpinImpl(rowId: string): boolean {
    if (typeof rowId !== "string" || rowId.length === 0) {
      return false;
    }
    if (!set.has(rowId)) return false;
    const i = order.indexOf(rowId);
    if (i >= 0) order.splice(i, 1);
    set.delete(rowId);
    return true;
  }

  return {
    size(): number {
      return order.length;
    },
    capacity(): number {
      return capacity;
    },
    isPinned(rowId: string): boolean {
      if (typeof rowId !== "string" || rowId.length === 0) {
        return false;
      }
      return set.has(rowId);
    },
    pin(rowId: string): boolean {
      return pinImpl(rowId);
    },
    unpin(rowId: string): boolean {
      return unpinImpl(rowId);
    },
    togglePin(rowId: string): void {
      if (typeof rowId !== "string" || rowId.length === 0) {
        return;
      }
      if (set.has(rowId)) unpinImpl(rowId);
      else pinImpl(rowId);
    },
    unpinAll(): void {
      order.length = 0;
      set.clear();
    },
    reorder(rowId: string, newIndex: number): void {
      if (typeof rowId !== "string" || rowId.length === 0) {
        return;
      }
      if (!Number.isFinite(newIndex)) return;
      if (!set.has(rowId)) return;
      const currentIndex = order.indexOf(rowId);
      if (currentIndex < 0) return;
      const target = Math.max(
        0,
        Math.min(order.length - 1, Math.floor(newIndex)),
      );
      if (target === currentIndex) return;
      order.splice(currentIndex, 1);
      order.splice(target, 0, rowId);
    },
    pinnedIds(): readonly string[] {
      return order.slice();
    },
  };
}
