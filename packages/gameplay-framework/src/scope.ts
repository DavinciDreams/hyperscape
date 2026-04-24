/**
 * Plugin context scope factory.
 *
 * `PluginContextScopeHandle` is a type-only contract on the gameplay-
 * framework's public surface. Hosts and plugin authors previously had
 * to write their own implementation (the test shim in
 * `plugin-hello-reference` does this). That duplication is a
 * footgun — the LIFO drain, error collection, and reopen-semantics
 * should be uniform across every host.
 *
 * `createPluginContextScope(pluginId)` provides the canonical
 * implementation:
 *   - `register(disposer)` appends to an internal array.
 *   - `dispose()` pops in reverse (LIFO), awaits each disposer, and
 *     collects thrown/rejected errors. After the full drain, the
 *     first-collected error is rethrown (wrapped in
 *     `PluginScopeDrainError` if multiple disposers failed, so
 *     callers can inspect the full error list).
 *   - `register()` after drain (without `reopen()`) throws — keeps
 *     stale plugins from leaking resources silently.
 *   - `dispose()` is idempotent: calling it again after a drain just
 *     resolves immediately with no further work.
 *   - `reopen()` clears the drained flag so the scope can accept new
 *     disposers for the next enable cycle.
 *
 * Why reopen instead of always re-arming on dispose? Because the host
 * controls the lifecycle. A plugin that's been disabled should see
 * `register` throw if it tries to re-register after the fact — that's
 * almost always a bug. `reopen` is an explicit host-side action at
 * enable time.
 */

import type { PluginContextScopeHandle } from "./index.js";

/**
 * Error thrown when multiple disposers fail during a single drain.
 *
 * Single-failure drains rethrow the original error directly — this
 * wrapper only appears when more than one disposer failed, so the
 * caller can see the full set.
 */
export class PluginScopeDrainError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly errors: ReadonlyArray<unknown>,
  ) {
    const first = errors[0];
    const firstMessage = first instanceof Error ? first.message : String(first);
    super(
      `Plugin scope "${pluginId}" drain failed: ${errors.length} disposer(s) threw. ` +
        `First: ${firstMessage}`,
    );
    this.name = "PluginScopeDrainError";
  }
}

/** Error thrown when `register` is called on a drained, not-yet-reopened scope. */
export class PluginScopeUseAfterDisposeError extends Error {
  constructor(public readonly pluginId: string) {
    super(
      `Plugin scope "${pluginId}" has been disposed; call reopen() before registering more disposers.`,
    );
    this.name = "PluginScopeUseAfterDisposeError";
  }
}

/**
 * Construct a fresh `PluginContextScopeHandle`.
 *
 * `pluginId` is stamped onto the handle + any errors so diagnostic
 * messages carry the offender's identity without the host having to
 * thread it through separately.
 */
export function createPluginContextScope(
  pluginId: string,
): PluginContextScopeHandle {
  let disposers: Array<() => void | Promise<void>> = [];
  let drained = false;

  return {
    pluginId,

    register(disposer) {
      if (drained) {
        throw new PluginScopeUseAfterDisposeError(pluginId);
      }
      disposers.push(disposer);
    },

    async dispose() {
      // Idempotent — already-drained scopes do nothing.
      if (drained) return;
      drained = true;

      const errors: unknown[] = [];
      // LIFO — pop-and-await so each disposer runs before the next.
      // Cannot use Promise.all; disposers may rely on ordering.
      while (disposers.length > 0) {
        const d = disposers.pop()!;
        try {
          await d();
        } catch (err) {
          errors.push(err);
        }
      }

      if (errors.length === 1) {
        // Rethrow the original single failure unchanged — callers
        // working with typed errors shouldn't have to unwrap a
        // single-child aggregate.
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new PluginScopeDrainError(pluginId, errors);
      }
    },

    reopen() {
      // Explicit host-side op. Clears the drained flag and the list
      // (which should already be empty — dispose drains it — but be
      // defensive in case a test scenario reuses a partially-drained
      // handle).
      drained = false;
      disposers = [];
    },
  };
}
