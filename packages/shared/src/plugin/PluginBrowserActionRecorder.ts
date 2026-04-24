/**
 * Ring-buffered recorder for {@link PluginBrowserAction} values,
 * with a companion `replayPluginBrowserActions` helper that re-runs
 * a captured action list through {@link pluginBrowserReducer} to
 * reach the same terminal state.
 *
 * Canonical use cases:
 *  1. **Bug-report capture** — wrap `store.dispatch` with a
 *     recorder and stash the snapshot alongside console logs when
 *     the user files a ticket.
 *  2. **Regression replay** — replay a captured action list over a
 *     fresh `initialPluginBrowserState()` and assert the final
 *     state matches a golden fixture.
 *  3. **Devtools time-travel** — render the captured list in an
 *     inspector panel and jump to any prefix by replaying the
 *     prefix over the initial state.
 *
 * Pure logic. The recorder owns no I/O — `now` is injected (default:
 * `Date.now`) so tests can drive it deterministically and the
 * module works in non-DOM contexts (workers, tests, SSR).
 *
 * Pure transforms / helpers. Never throw.
 */

import {
  pluginBrowserReducer,
  type PluginBrowserAction,
  type PluginBrowserState,
} from "./PluginBrowserReducer.js";

/** One recorded entry: the action plus its capture timestamp. */
export interface PluginBrowserActionRecord {
  readonly action: PluginBrowserAction;
  readonly recordedAt: number;
}

export interface PluginBrowserActionRecorder {
  /**
   * Capture an action. If the buffer would overflow `maxRecords`,
   * the oldest entry is dropped (FIFO ring-buffer).
   */
  record(action: PluginBrowserAction, now?: number): void;
  /**
   * Immutable snapshot of the current buffer, oldest-first. Safe to
   * pass around — the recorder does not mutate previously-returned
   * snapshots (copy-on-grow).
   */
  snapshot(): readonly PluginBrowserActionRecord[];
  /** Drop all recorded actions. */
  reset(): void;
  /** Current buffer length. */
  readonly size: number;
}

export interface CreatePluginBrowserActionRecorderOptions {
  /** Maximum number of records to retain. Default: 500. */
  readonly maxRecords?: number;
  /** Clock used when `record(...)` is called without an explicit `now`. */
  readonly now?: () => number;
}

export const DEFAULT_MAX_ACTION_RECORDS = 500;

export function createPluginBrowserActionRecorder(
  options: CreatePluginBrowserActionRecorderOptions = {},
): PluginBrowserActionRecorder {
  const maxRecords = Math.max(
    1,
    options.maxRecords ?? DEFAULT_MAX_ACTION_RECORDS,
  );
  const clock = options.now ?? Date.now;
  let buffer: PluginBrowserActionRecord[] = [];

  return {
    record(action, now) {
      const rec: PluginBrowserActionRecord = {
        action,
        recordedAt: now ?? clock(),
      };
      if (buffer.length >= maxRecords) {
        buffer = buffer.slice(buffer.length - maxRecords + 1);
      }
      buffer.push(rec);
    },
    snapshot() {
      // Return a frozen shallow copy so callers can't mutate the
      // internal buffer through the reference.
      return buffer.slice();
    },
    reset() {
      buffer = [];
    },
    get size() {
      return buffer.length;
    },
  };
}

/**
 * Fold a sequence of actions through `pluginBrowserReducer`,
 * producing the terminal state. Accepts raw actions or extracted
 * records — callers with `PluginBrowserActionRecord[]` can pass
 * `records.map((r) => r.action)`.
 */
export function replayPluginBrowserActions(
  initialState: PluginBrowserState,
  actions: Iterable<PluginBrowserAction>,
): PluginBrowserState {
  let state = initialState;
  for (const action of actions) {
    state = pluginBrowserReducer(state, action);
  }
  return state;
}

/** Extract just the actions from a record list, preserving order. */
export function pluginBrowserActionsFromRecords(
  records: Iterable<PluginBrowserActionRecord>,
): PluginBrowserAction[] {
  const out: PluginBrowserAction[] = [];
  for (const r of records) out.push(r.action);
  return out;
}
