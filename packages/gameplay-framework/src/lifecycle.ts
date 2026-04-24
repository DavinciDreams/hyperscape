/**
 * Plugin lifecycle driver — the composition layer that sits on top of
 * everything else in `@hyperforge/gameplay-framework`.
 *
 * Given an already-ordered list of `LoadedPluginModule`s (from
 * `resolvePluginLoadOrder`), `startPluginsInOrder` instantiates each
 * plugin, constructs a per-plugin scope + context, and runs
 * `onLoad` → `onEnable` in topo order. `stopPluginsInReverseOrder`
 * unwinds: `onDisable` in reverse topo, then `scope.dispose()` on each.
 *
 * These are deliberately two discrete functions rather than a stateful
 * `PluginHost` class. Callers that want persistent state (Plugin Browser
 * UI, dev-loop hot-reload, etc.) wrap them. Callers that want a one-shot
 * host just call them back-to-back.
 *
 * Error semantics:
 *   - Start is fail-fast. If any plugin's `onLoad` or `onEnable` throws,
 *     the error propagates immediately. Already-started plugins are NOT
 *     automatically torn down — the caller decides (a broken start may
 *     want diagnostics before cleanup).
 *   - Stop is best-effort. Each plugin's `onDisable` runs inside a
 *     try/finally so its `scope.dispose()` ALWAYS runs, even if
 *     `onDisable` throws. Thrown errors are collected; the first
 *     non-undefined error is rethrown after the full drain (matching
 *     `PluginContextScope`'s single-error semantics). Multiple errors
 *     wrap in `PluginLifecycleStopError`.
 */

import type {
  HyperforgePlugin,
  PluginContextBase,
  PluginContextScopeHandle,
  PluginFactory,
  PluginManifest,
} from "./index.js";

import { createPluginContextScope } from "./scope.js";

import type { LoadedPluginModule } from "./loader.js";

/**
 * Everything the host holds onto for a running plugin. Returned by
 * `startPluginsInOrder` so callers can inspect / teardown.
 */
export interface PluginInstanceRecord<TContext extends PluginContextBase> {
  readonly manifest: PluginManifest;
  readonly plugin: HyperforgePlugin<TContext>;
  readonly ctx: TContext;
  readonly scope: PluginContextScopeHandle;
}

/**
 * Factory the caller supplies to turn a raw scope handle into the context
 * type their plugins expect. `PluginContextBase` is the minimum contract
 * (`pluginId` + `scope`); authors extend with world refs, registries,
 * widgets, etc.
 */
export type PluginContextFactory<TContext extends PluginContextBase> = (args: {
  pluginId: string;
  scope: PluginContextScopeHandle;
}) => TContext;

/** Error wrapping multiple `onDisable` failures during a single stop. */
export class PluginLifecycleStopError extends Error {
  constructor(public readonly errors: ReadonlyArray<unknown>) {
    const first = errors[0];
    const firstMessage = first instanceof Error ? first.message : String(first);
    super(
      `Plugin lifecycle stop failed: ${errors.length} plugin(s) threw during onDisable. ` +
        `First: ${firstMessage}`,
    );
    this.name = "PluginLifecycleStopError";
  }
}

/**
 * Instantiate each ordered module, wire up scope + ctx, and run
 * `onLoad` → `onEnable` in sequence. Returns a record per plugin so the
 * caller can later stop them.
 *
 * Sequential — not `Promise.all`. Plugins frequently expect dependencies
 * to already be enabled when their own `onEnable` runs.
 */
export async function startPluginsInOrder<TContext extends PluginContextBase>(
  ordered: ReadonlyArray<LoadedPluginModule<TContext>>,
  contextFactory: PluginContextFactory<TContext>,
): Promise<Array<PluginInstanceRecord<TContext>>> {
  const records: Array<PluginInstanceRecord<TContext>> = [];

  for (const mod of ordered) {
    const pluginId = mod.manifest.id;
    const scope = createPluginContextScope(pluginId);
    const ctx = contextFactory({ pluginId, scope });

    // Narrow the PluginFactory type argument; loader emits
    // PluginFactory<TContext> by generic so this is a no-op at runtime.
    const factory: PluginFactory<TContext> = mod.factory;
    const plugin = factory();

    // Fail-fast: if start throws, bubble up. Caller decides cleanup.
    await plugin.onLoad?.(ctx);
    await plugin.onEnable?.(ctx);

    records.push({ manifest: mod.manifest, plugin, ctx, scope });
  }

  return records;
}

/**
 * Unwind. Reverse topo order: last-started → first-started. Each plugin:
 *   1. `onDisable(ctx)` inside try/finally
 *   2. `scope.dispose()` always, even if `onDisable` threw
 *
 * Errors from either step are collected. After full drain:
 *   - 0 errors: resolves normally.
 *   - 1 error: rethrow unchanged.
 *   - 2+ errors: wrap in `PluginLifecycleStopError`.
 */
export async function stopPluginsInReverseOrder<
  TContext extends PluginContextBase,
>(records: ReadonlyArray<PluginInstanceRecord<TContext>>): Promise<void> {
  const errors: unknown[] = [];

  // Reverse iteration without mutating the input.
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i]!;
    try {
      try {
        await r.plugin.onDisable?.(r.ctx);
      } finally {
        // scope.dispose itself may throw PluginScopeDrainError / single
        // disposer error. We catch at the outer try to keep the reverse
        // walk moving.
        await r.scope.dispose();
      }
    } catch (err) {
      errors.push(err);
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new PluginLifecycleStopError(errors);
  }
}
