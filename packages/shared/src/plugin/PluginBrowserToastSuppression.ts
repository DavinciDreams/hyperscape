/**
 * Pure-logic suppression layer over {@link PluginBrowserToastIntent}
 * streams. Remembers which toast ids were already shown and filters
 * out repeat emissions within an optional cooldown window. Caller
 * owns the state (no module-level globals); the editor threads it
 * across refreshes.
 *
 * Pure transform. Never throws.
 */

import type { PluginBrowserToastIntent } from "./PluginBrowserToastRouter.js";

export interface ToastSuppressionState {
  /** `intent.id -> unix-millis of last emission`. */
  readonly shown: ReadonlyMap<string, number>;
}

export function emptyToastSuppressionState(): ToastSuppressionState {
  return { shown: new Map() };
}

export interface FilterToastIntentsOptions {
  readonly now: number;
  readonly previousState: ToastSuppressionState;
  /**
   * Milliseconds after which a previously-emitted toast id may fire
   * again. `0` (default) means permanent suppression for the life of
   * the state object — ideal for session-scoped history.
   */
  readonly cooldownMs?: number;
}

export interface FilterToastIntentsResult {
  readonly emitted: readonly PluginBrowserToastIntent[];
  readonly suppressed: readonly PluginBrowserToastIntent[];
  readonly nextState: ToastSuppressionState;
}

export function filterPluginBrowserToastIntents(
  intents: readonly PluginBrowserToastIntent[],
  options: FilterToastIntentsOptions,
): FilterToastIntentsResult {
  const cooldownMs = options.cooldownMs ?? 0;
  const emitted: PluginBrowserToastIntent[] = [];
  const suppressed: PluginBrowserToastIntent[] = [];
  const nextShown = new Map(options.previousState.shown);

  for (const intent of intents) {
    const lastAt = nextShown.get(intent.id);
    const shouldEmit =
      lastAt === undefined ||
      (cooldownMs > 0 && options.now - lastAt >= cooldownMs);
    if (shouldEmit) {
      emitted.push(intent);
      nextShown.set(intent.id, options.now);
    } else {
      suppressed.push(intent);
    }
  }

  return {
    emitted,
    suppressed,
    nextState: { shown: nextShown },
  };
}

/**
 * Drop entries whose last-shown timestamp is strictly older than
 * `now - retainMs`. Keeps long-running editor sessions from bloating
 * the shown-map without capping.
 */
export function pruneToastSuppressionState(
  state: ToastSuppressionState,
  options: { readonly now: number; readonly retainMs: number },
): ToastSuppressionState {
  const cutoff = options.now - options.retainMs;
  const next = new Map<string, number>();
  for (const [id, at] of state.shown) {
    if (at >= cutoff) next.set(id, at);
  }
  return { shown: next };
}
