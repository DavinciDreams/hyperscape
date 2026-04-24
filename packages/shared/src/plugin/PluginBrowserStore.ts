/**
 * Tiny observable store wrapping {@link pluginBrowserReducer}.
 *
 * Gives consumers a `{getState, dispatch, subscribe}` trio so the
 * React Plugin Browser panel — or any other view — can consume the
 * same reducer without forking store orchestration. React can wire
 * `useSyncExternalStore(store.subscribe, store.getState)`; non-React
 * consumers (tests, CLI driver, headless agents) can call
 * `dispatch` directly and poll via `getState`.
 *
 * Design choices (all intentional):
 *  - No module-level singleton. Callers construct a store per
 *    panel instance; multiple panels get independent state.
 *  - Subscribers are only notified on state **identity change**.
 *    The reducer already returns the same reference for no-op
 *    actions, so subscribers are spared spurious renders.
 *  - `subscribe` returns an `unsubscribe` function; re-adding the
 *    same listener works (listener set is a plain Set).
 *  - Listener errors are swallowed per-listener so one broken
 *    subscriber can't break others. The first swallowed error is
 *    surfaced to an optional `onListenerError` hook the caller
 *    can wire to a logger.
 *
 * Pure pattern, no I/O. Never throws from `dispatch` beyond what
 * the reducer itself throws (which is: nothing — the reducer is
 * total).
 */

import type {
  PluginBrowserAction,
  PluginBrowserState,
} from "./PluginBrowserReducer.js";
import {
  initialPluginBrowserState,
  pluginBrowserReducer,
} from "./PluginBrowserReducer.js";

/** Listener invoked after each dispatch that produced new state. */
export type PluginBrowserStoreListener = (state: PluginBrowserState) => void;

/** Options passed to {@link createPluginBrowserStore}. */
export interface CreatePluginBrowserStoreOptions {
  /** Seed state. Defaults to {@link initialPluginBrowserState}. */
  readonly initialState?: PluginBrowserState;
  /**
   * Invoked (at most once per dispatch) when one of the listeners
   * threw. Subsequent listeners still run. Useful to pipe to a
   * logger; when omitted, listener errors are silently swallowed.
   */
  readonly onListenerError?: (error: unknown) => void;
}

export interface PluginBrowserStore {
  /** Current state snapshot. Cheap; returns the reducer's last output. */
  readonly getState: () => PluginBrowserState;
  /**
   * Apply `action` through the reducer. Notifies subscribers only
   * when the state identity changed.
   */
  readonly dispatch: (action: PluginBrowserAction) => void;
  /**
   * Register a listener. Returns a function that removes the
   * listener. Safe to call the returned unsubscribe multiple
   * times.
   */
  readonly subscribe: (listener: PluginBrowserStoreListener) => () => void;
}

/**
 * Construct a new Plugin Browser store. Each call returns an
 * independent instance.
 */
export function createPluginBrowserStore(
  options: CreatePluginBrowserStoreOptions = {},
): PluginBrowserStore {
  let state: PluginBrowserState =
    options.initialState ?? initialPluginBrowserState();
  const listeners = new Set<PluginBrowserStoreListener>();
  let firstError: unknown = undefined;

  const notify = () => {
    firstError = undefined;
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (err) {
        if (firstError === undefined) firstError = err;
      }
    }
    if (firstError !== undefined && options.onListenerError) {
      options.onListenerError(firstError);
    }
  };

  return {
    getState: () => state,
    dispatch: (action) => {
      const next = pluginBrowserReducer(state, action);
      if (next === state) return;
      state = next;
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
