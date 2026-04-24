/**
 * Plugin host.
 *
 * Thin convenience facade that composes `PluginCatalog` +
 * `PluginLoader` + auto-`PluginContextScope` management into a single
 * object. Callers provide a `buildContext(manifest, scope) => TContext`
 * factory that assembles their typed context, and the host handles:
 *   - building a fresh `PluginContextScope` per plugin (passed to
 *     `buildContext` so the context can expose scope-tracked
 *     registration helpers)
 *   - wrapping plugin factories so `onDisable` always drains the
 *     scope (user `onDisable` runs first, then scope disposers LIFO)
 *
 * `TContext` must extend `PluginContextBase` so the host can reach the
 * scope. In practice authors subclass `PluginContextBase` and add
 * their own registries / handles.
 *
 * Scope intentionally mirrors UE5's `FPluginManager` surface area —
 * just enough to drive the lifecycle; dynamic imports and semver
 * range resolution stay in the (future) `@hyperforge/gameplay-framework`.
 */

import type { PluginManifest } from "@hyperforge/manifest-schema";
import { PluginCatalog } from "./PluginCatalog.js";
import { PluginContextScope } from "./PluginContextScope.js";
import {
  type HyperforgePlugin,
  type PluginContextProvider,
  type PluginFactory,
  type PluginRecord,
  PluginLoader,
} from "./PluginLoader.js";

/**
 * Every host-managed context exposes its scope. Authors extend this
 * interface with their own handles (world refs, registries, widgets).
 */
export interface PluginContextBase {
  readonly pluginId: string;
  readonly scope: PluginContextScope;
}

export type PluginContextBuilder<TContext extends PluginContextBase> = (
  manifest: PluginManifest,
  scope: PluginContextScope,
) => TContext;

export class PluginHost<TContext extends PluginContextBase> {
  private readonly _catalog: PluginCatalog;
  private readonly _loader: PluginLoader<TContext>;
  private readonly _buildContext: PluginContextBuilder<TContext>;

  constructor(
    catalog: PluginCatalog,
    buildContext: PluginContextBuilder<TContext>,
  ) {
    this._catalog = catalog;
    this._buildContext = buildContext;
    const provider: PluginContextProvider<TContext> = (manifest) => {
      const scope = new PluginContextScope(manifest.id);
      return this._buildContext(manifest, scope);
    };
    this._loader = new PluginLoader<TContext>(catalog, provider);
  }

  get catalog(): PluginCatalog {
    return this._catalog;
  }

  get loader(): PluginLoader<TContext> {
    return this._loader;
  }

  /**
   * Register a plugin factory. The host wraps the factory so
   * `onDisable` always drains the context scope after the user's
   * own `onDisable` runs. Scope drain is best-effort: errors from
   * individual disposers are collected, first is rethrown.
   */
  registerPlugin(pluginId: string, factory: PluginFactory<TContext>): void {
    this._loader.registerFactory(pluginId, wrapWithScopeDispose(factory));
  }

  hasPlugin(pluginId: string): boolean {
    return this._loader.hasFactory(pluginId);
  }

  getRecord(pluginId: string): PluginRecord<TContext> {
    return this._loader.getRecord(pluginId);
  }

  get records(): readonly PluginRecord<TContext>[] {
    return this._loader.records;
  }

  async loadAll(): Promise<void> {
    return this._loader.loadAll();
  }

  async enableAll(): Promise<void> {
    return this._loader.enableAll();
  }

  async disableAll(): Promise<void> {
    return this._loader.disableAll();
  }

  /**
   * Per-plugin lifecycle passthroughs for the editor / dev console /
   * CLI. Each matches `PluginLoader`'s state-machine semantics:
   *   - `enablePlugin(id)` — `loaded|disabled` → `enabled` (no-op if
   *     already enabled; throws if registered or failed; enforces
   *     hard deps currently enabled).
   *   - `disablePlugin(id, {force?})` — `enabled` → `disabled` (no-op
   *     otherwise; refuses if enabled dependents exist unless
   *     `force`).
   *   - `reloadPlugin(id)` — rebuild the plugin instance and restore
   *     its prior state; refuses if never loaded.
   */
  async enablePlugin(pluginId: string): Promise<void> {
    return this._loader.enablePlugin(pluginId);
  }

  async disablePlugin(
    pluginId: string,
    options: { readonly force?: boolean } = {},
  ): Promise<void> {
    return this._loader.disablePlugin(pluginId, options);
  }

  async reloadPlugin(pluginId: string): Promise<void> {
    return this._loader.reloadPlugin(pluginId);
  }

  /**
   * Convenience: `loadAll` then `enableAll`. Matches the common
   * "bring plugins up" startup pattern. Errors short-circuit — an
   * `onLoad` failure throws before `enableAll` runs.
   */
  async loadAndEnable(): Promise<void> {
    await this._loader.loadAll();
    await this._loader.enableAll();
  }

  /**
   * Convenience: disable every currently-enabled plugin. Alias for
   * `disableAll` kept to make the intent clear at shutdown callsites.
   */
  async destroy(): Promise<void> {
    await this._loader.disableAll();
  }

  /**
   * Snapshot the ids of plugins currently in each lifecycle state.
   * Editor "Plugin Browser" panels can render from this without
   * iterating `records` themselves.
   */
  snapshot(): {
    registered: readonly string[];
    loaded: readonly string[];
    enabled: readonly string[];
    disabled: readonly string[];
    failed: readonly string[];
  } {
    const result = {
      registered: [] as string[],
      loaded: [] as string[],
      enabled: [] as string[],
      disabled: [] as string[],
      failed: [] as string[],
    };
    for (const r of this._loader.records) {
      result[r.state].push(r.manifest.id);
    }
    return result;
  }
}

/**
 * Wrap a user factory so `onDisable(ctx)` invokes the user hook
 * first, then `ctx.scope.dispose()` — in a `try/finally` so the
 * scope always drains even if the user hook throws.
 *
 * Re-exported from `HelloReferencePlugin`'s `withScopeDispose` would
 * be fine, but we duplicate here so the base package doesn't depend
 * on the example module.
 */
function wrapWithScopeDispose<TContext extends PluginContextBase>(
  factory: PluginFactory<TContext>,
): PluginFactory<TContext> {
  return () => {
    const user = factory();
    const wrapped: HyperforgePlugin<TContext> = {};
    if (user.onLoad) {
      wrapped.onLoad = (ctx) => user.onLoad!(ctx);
    }
    if (user.onEnable) {
      wrapped.onEnable = (ctx) => user.onEnable!(ctx);
    }
    // Always install an onDisable that drains the scope, even if
    // the user plugin didn't provide one. After a clean dispose,
    // reopen the scope so the same context object — and the scope
    // reference other plugins may have captured during `onLoad` —
    // accepts fresh disposers on the next `onEnable` cycle. If
    // `dispose()` itself throws (user disposer raised), the scope
    // is left fully disposed and `reopen()` does not run, matching
    // the pre-existing failure surface.
    wrapped.onDisable = async (ctx) => {
      try {
        await user.onDisable?.(ctx);
      } finally {
        await ctx.scope.dispose();
        ctx.scope.reopen();
      }
    };
    return wrapped;
  };
}
