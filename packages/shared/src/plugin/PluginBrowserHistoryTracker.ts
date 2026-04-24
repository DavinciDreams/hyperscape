/**
 * Pure browser-style back/forward history over visited plugin ids.
 *
 * Drives the Plugin Browser's navigation affordances (back/forward
 * buttons, keyboard Alt+Left / Alt+Right) without pulling in DOM
 * `History` or any browser-global API. Caller owns the tracker
 * instance and feeds it `visit(pluginId)` whenever the selection
 * changes so it can later replay the path.
 *
 * Semantics (mirrors browser History API):
 *  - `visit(id)` pushes a new entry onto the back stack and clears
 *    the forward stack. Consecutive duplicates collapse (revisiting
 *    the currently-displayed id is a no-op).
 *  - `back()` returns the previous entry (if any) and moves the
 *    cursor back one step. Forward stack is implicitly lengthened.
 *  - `forward()` moves the cursor forward one step and returns the
 *    new current entry.
 *  - `current()` reports the cursor's current entry, or `null` when
 *    the tracker is empty.
 *  - `canBack()` / `canForward()` are cheap predicates for UI gating.
 *  - `clear()` wipes the tracker to empty (cursor = null).
 *
 * Capacity is bounded by `maxEntries` (default 50, clamped to >= 1).
 * When a new `visit` would exceed capacity, the oldest entry is
 * dropped from the back of the back-stack. Forward-stack entries
 * are *never* dropped for capacity — they die naturally when a new
 * visit clears them.
 *
 * Pure logic, no side effects beyond the tracker's own state.
 * Never throws.
 */

export interface PluginBrowserHistoryTrackerOptions {
  /** Maximum retained entries. Clamped to >= 1. Default 50. */
  readonly maxEntries?: number;
}

export interface PluginBrowserHistoryTracker {
  /** Record a visit. Consecutive duplicates collapse. */
  visit(pluginId: string): void;
  /** Move the cursor one step back; returns the new current. */
  back(): string | null;
  /** Move the cursor one step forward; returns the new current. */
  forward(): string | null;
  /** Currently displayed entry, or `null` if tracker is empty. */
  current(): string | null;
  /** True iff `back()` would move. */
  canBack(): boolean;
  /** True iff `forward()` would move. */
  canForward(): boolean;
  /** Full back stack (oldest → current, inclusive), newest last. */
  readonly backStack: readonly string[];
  /** Forward stack (nearest → farthest), next-to-current first. */
  readonly forwardStack: readonly string[];
  /** Wipe the tracker to empty. */
  clear(): void;
}

const DEFAULT_MAX_ENTRIES = 50;

/**
 * Construct a pure-logic history tracker. Caller owns the returned
 * instance; the tracker mutates its own internal arrays in place.
 */
export function createPluginBrowserHistoryTracker(
  options: PluginBrowserHistoryTrackerOptions = {},
): PluginBrowserHistoryTracker {
  const maxEntries = Math.max(
    1,
    Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES),
  );

  // `back` holds oldest → current. The last element is the current.
  // `forward` holds the chain you'd walk into with forward(),
  // nearest-first (so `forward[0]` is the immediate next).
  const back: string[] = [];
  const forward: string[] = [];

  function current(): string | null {
    return back.length === 0 ? null : back[back.length - 1];
  }

  function visit(pluginId: string): void {
    // Collapse consecutive duplicates: revisiting the current
    // entry is a no-op — do NOT clear the forward stack.
    if (current() === pluginId) return;

    back.push(pluginId);
    // Forward stack is invalidated whenever a new branch begins.
    forward.length = 0;

    // Capacity enforcement: drop oldest back entries only.
    while (back.length > maxEntries) {
      back.shift();
    }
  }

  function canBack(): boolean {
    return back.length > 1;
  }

  function canForward(): boolean {
    return forward.length > 0;
  }

  function back_(): string | null {
    if (!canBack()) return current();
    const popped = back.pop();
    if (popped !== undefined) {
      // Put the popped entry at the *head* of forward (nearest-first).
      forward.unshift(popped);
    }
    return current();
  }

  function forward_(): string | null {
    if (!canForward()) return current();
    const next = forward.shift();
    if (next !== undefined) {
      back.push(next);
      // No capacity check needed here — forward entries were
      // already part of the back stack and fit within capacity.
    }
    return current();
  }

  function clear(): void {
    back.length = 0;
    forward.length = 0;
  }

  return {
    visit,
    back: back_,
    forward: forward_,
    current,
    canBack,
    canForward,
    get backStack() {
      return back;
    },
    get forwardStack() {
      return forward;
    },
    clear,
  };
}
