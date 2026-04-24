/**
 * Pure drag-reorder gesture state for the Plugin Browser.
 *
 * Drives column reordering (and row reordering when the Plugin
 * Browser's list view is in manual-order mode) without pulling in
 * any DOM APIs. Caller wires pointer-down → `beginDrag(fromIndex,
 * nowMs)`, pointermove → `moveOver(overIndex)`, and
 * pointer-up/keyboard-Enter → `commit()` or Escape → `cancel()`.
 *
 * Semantics:
 *  - `beginDrag(from)` opens a gesture. Invalid indices or
 *    non-finite `nowMs` are rejected (silent no-op).
 *  - `moveOver(over)` updates the drop target. Invalid indices
 *    clear the drop target but leave the gesture open so the user
 *    can wander off-rail without losing their drag.
 *  - `commit()` returns `{from, to}` when a valid non-identity
 *    drop has been armed, then closes the gesture. When no drop
 *    target is set, `over === from`, or indices are invalid,
 *    returns `undefined` and still closes the gesture.
 *  - `cancel()` aborts the gesture. Returns true iff a gesture
 *    was in flight.
 *
 * Index validation: must be a non-negative **integer**. Caller
 * owns collection-bound checks — this module has no notion of
 * how many items exist.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws.
 */

export interface PluginBrowserDragReorderSnapshot {
  readonly isDragging: boolean;
  readonly source: number | undefined;
  readonly over: number | undefined;
  readonly startedAtMs: number | undefined;
}

export interface PluginBrowserDragReorderCommit {
  readonly from: number;
  readonly to: number;
}

export interface PluginBrowserDragReorderState {
  isDragging(): boolean;
  source(): number | undefined;
  over(): number | undefined;
  startedAtMs(): number | undefined;
  /**
   * Open a drag gesture anchored at `fromIndex`. Returns true
   * when the gesture was opened (including "replaced an existing
   * gesture"). Returns false on invalid input.
   */
  beginDrag(fromIndex: number, nowMs: number): boolean;
  /**
   * Update the current drop target. Returns true when the
   * internal `over` cell actually changed. Invalid `overIndex`
   * clears the drop target (returns true iff it was previously
   * set).
   */
  moveOver(overIndex: number): boolean;
  /**
   * Commit the gesture. Always closes any in-flight gesture.
   * Returns `{from, to}` only when a valid non-identity drop
   * was armed; otherwise returns `undefined`.
   */
  commit(): PluginBrowserDragReorderCommit | undefined;
  /** Abort the gesture. Returns true iff a gesture was open. */
  cancel(): boolean;
  snapshot(): PluginBrowserDragReorderSnapshot;
}

/**
 * Create a caller-owned drag-reorder gesture tracker.
 */
export function createPluginBrowserDragReorderState(): PluginBrowserDragReorderState {
  let source: number | undefined;
  let over: number | undefined;
  let startedAt: number | undefined;

  function isValidIndex(n: number): boolean {
    return (
      typeof n === "number" &&
      Number.isFinite(n) &&
      Number.isInteger(n) &&
      n >= 0
    );
  }

  function isValidNow(n: number): boolean {
    return typeof n === "number" && Number.isFinite(n);
  }

  function closeGesture(): void {
    source = undefined;
    over = undefined;
    startedAt = undefined;
  }

  return {
    isDragging(): boolean {
      return source !== undefined;
    },
    source(): number | undefined {
      return source;
    },
    over(): number | undefined {
      return over;
    },
    startedAtMs(): number | undefined {
      return startedAt;
    },
    beginDrag(fromIndex: number, nowMs: number): boolean {
      if (!isValidIndex(fromIndex) || !isValidNow(nowMs)) {
        return false;
      }
      source = fromIndex;
      over = undefined;
      startedAt = nowMs;
      return true;
    },
    moveOver(overIndex: number): boolean {
      if (source === undefined) return false;
      if (!isValidIndex(overIndex)) {
        if (over !== undefined) {
          over = undefined;
          return true;
        }
        return false;
      }
      if (over === overIndex) return false;
      over = overIndex;
      return true;
    },
    commit(): PluginBrowserDragReorderCommit | undefined {
      if (source === undefined) return undefined;
      const from = source;
      const to = over;
      closeGesture();
      if (to === undefined) return undefined;
      if (from === to) return undefined;
      return { from, to };
    },
    cancel(): boolean {
      if (source === undefined) return false;
      closeGesture();
      return true;
    },
    snapshot(): PluginBrowserDragReorderSnapshot {
      return {
        isDragging: source !== undefined,
        source,
        over,
        startedAtMs: startedAt,
      };
    },
  };
}
