/**
 * Reference-equality-based slice subscription over a
 * {@link PluginBrowserStore}. Avoids the "useSelector"-style
 * re-render storm where every dispatch notifies every observer
 * regardless of whether the slice they care about actually
 * changed.
 *
 * Call `subscribePluginBrowserStoreSlice(store, select, listener)`
 * to be notified only when `select(state)` yields a different
 * reference than the previously-seen slice. The listener is not
 * invoked for the initial value — callers who want that can
 * trivially call `listener(select(store.getState()))` themselves.
 *
 * Shallow-compare helper is also exported so callers can opt into
 * shallow equality when their selector allocates a fresh object
 * each call (e.g. `{a: state.a, b: state.b}`).
 *
 * Pure transforms / helpers. Never throw.
 */

import type {
  PluginBrowserStore,
  PluginBrowserStoreListener,
} from "./PluginBrowserStore.js";
import type { PluginBrowserState } from "./PluginBrowserReducer.js";

/** Select a slice from state. Must be deterministic. */
export type PluginBrowserSelector<T> = (state: PluginBrowserState) => T;

/** Optional equality fn. Default is reference equality (`===`). */
export type PluginBrowserEqualityFn<T> = (a: T, b: T) => boolean;

export interface SubscribePluginBrowserStoreSliceOptions<T> {
  /**
   * Comparator. Return `true` when the two slices are equal and
   * the listener should NOT fire.
   */
  readonly equals?: PluginBrowserEqualityFn<T>;
}

/**
 * Subscribe to a slice of the store's state. Returns an
 * `unsubscribe` function. The listener is only invoked when
 * `select(state)` produces a value that is **not equal** to the
 * previously-seen slice according to `equals` (default: `===`).
 *
 * The listener is not invoked on subscription — if the caller
 * wants to initialize from the current state, they can pull it
 * themselves via `store.getState()`.
 */
export function subscribePluginBrowserStoreSlice<T>(
  store: PluginBrowserStore,
  select: PluginBrowserSelector<T>,
  listener: (slice: T) => void,
  options: SubscribePluginBrowserStoreSliceOptions<T> = {},
): () => void {
  const equals = options.equals ?? referenceEquals;
  let lastSeen: T = select(store.getState());

  const storeListener: PluginBrowserStoreListener = (state) => {
    const next = select(state);
    if (equals(lastSeen, next)) return;
    lastSeen = next;
    listener(next);
  };

  return store.subscribe(storeListener);
}

/** Strict reference equality. Safe default for well-written reducers. */
export function referenceEquals<T>(a: T, b: T): boolean {
  return a === b;
}

/**
 * Shallow equality for plain objects and arrays. Returns `true`
 * when both have identical keys/length AND every value is
 * reference-equal. Non-plain inputs (null, primitives, Maps, Sets)
 * fall back to `===`.
 *
 * Useful when the selector allocates a fresh object/array on every
 * call by composing two unrelated slices (`{a: state.x, b:
 * state.y}`) — without shallow compare, every dispatch would fire.
 */
export function shallowEquals(a: unknown, b: unknown): boolean {
  if (referenceEquals(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  // Array path — cheaper than Object.keys.
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // Plain-object path.
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (
      (a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]
    ) {
      return false;
    }
  }
  return true;
}
