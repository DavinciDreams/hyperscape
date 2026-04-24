/**
 * One-shot bootstrap: plugin registry → ready-to-use PluginHost.
 *
 * Composes `buildPluginCatalogFromRegistry` (from `PluginRegistryBridge`)
 * with a `PluginHost<TContext>` factory. Callers supply:
 *   - the parsed registry manifest (usually from
 *     `pluginRegistryProvider.getManifest()`)
 *   - a `buildContext(manifest, scope) => TContext` — identical to the
 *     host's normal constructor arg
 *   - a `factories` map of plugin id → `PluginFactory<TContext>`
 *
 * The bootstrap:
 *   1. Builds a catalog from the registry
 *   2. Instantiates a `PluginHost<TContext>`
 *   3. Registers every factory whose plugin id appears in the registry
 *   4. Returns the host (caller decides when to `loadAll` / `enableAll`)
 *
 * Plugins in the registry WITHOUT a factory in the map stay unregistered
 * — `PluginHost.loadAll()` will fail-fast with
 * `MissingPluginFactoryError` at load time, which is exactly the same
 * behaviour as constructing the host by hand. Factories in the map
 * that don't correspond to a registry entry throw `UnregisteredPluginError`
 * so callers notice when they've registered a factory for a plugin
 * the project isn't installing.
 */

import type { PluginRegistryManifest } from "@hyperforge/manifest-schema";
import { PluginCatalog } from "./PluginCatalog.js";
import {
  type PluginContextBase,
  type PluginContextBuilder,
  PluginHost,
} from "./PluginHost.js";
import type { PluginFactory } from "./PluginLoader.js";
import { buildPluginCatalogFromRegistry } from "./PluginRegistryBridge.js";

export class UnregisteredPluginError extends Error {
  readonly pluginId: string;
  constructor(pluginId: string, knownIds: readonly string[]) {
    super(
      `factory registered for plugin "${pluginId}" but that plugin is not in the registry. Known ids: ${
        knownIds.length > 0 ? knownIds.join(", ") : "(none)"
      }`,
    );
    this.name = "UnregisteredPluginError";
    this.pluginId = pluginId;
  }
}

export interface CreatePluginHostOptions<TContext extends PluginContextBase> {
  /**
   * Parsed plugin-registry manifest. Usually
   * `pluginRegistryProvider.getManifest() ?? {plugins:[], enabledByDefault:{}}`.
   */
  readonly registry: PluginRegistryManifest;
  /**
   * Called once per plugin during `loadAll` to assemble the runtime
   * context. Identical semantics to `PluginHost`'s constructor arg.
   */
  readonly buildContext: PluginContextBuilder<TContext>;
  /**
   * Plugin id → factory. Usually provided by the caller (gameplay
   * framework, server bootstrap, test harness). Factories are
   * auto-wrapped with `scope.dispose()` on disable by `PluginHost`.
   */
  readonly factories: Readonly<Record<string, PluginFactory<TContext>>>;
}

/**
 * Build a `PluginHost<TContext>` from a plugin registry + a factory
 * map. The returned host has every registered factory bound and is
 * ready for `loadAll` / `enableAll`.
 *
 * Unknown factory ids throw `UnregisteredPluginError` immediately,
 * before any lifecycle hook fires. Missing factories for registered
 * plugins are surfaced later as `MissingPluginFactoryError` during
 * `loadAll`.
 */
export function createPluginHostFromRegistry<
  TContext extends PluginContextBase,
>(opts: CreatePluginHostOptions<TContext>): PluginHost<TContext> {
  const catalog: PluginCatalog = buildPluginCatalogFromRegistry(opts.registry);
  const host = new PluginHost<TContext>(catalog, opts.buildContext);
  const registryIds = new Set(opts.registry.plugins.map((p) => p.id));
  for (const [pluginId, factory] of Object.entries(opts.factories)) {
    if (!registryIds.has(pluginId)) {
      throw new UnregisteredPluginError(
        pluginId,
        opts.registry.plugins.map((p) => p.id),
      );
    }
    host.registerPlugin(pluginId, factory);
  }
  return host;
}
