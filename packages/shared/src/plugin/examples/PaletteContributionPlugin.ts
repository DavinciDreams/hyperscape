/**
 * Palette-contribution reference plugin (I4 reference).
 *
 * Demonstrates the Phase I "editor API" seam (Step 12): a plugin
 * contributes editor palette categories into a caller-owned
 * `PluginContributionRegistry`, and the scope-tracked disposer
 * atomically retracts the whole bundle on `onDisable` without the
 * plugin body having to track individual ids.
 *
 * This is the shape every editor surface will take — toolbar tools,
 * widgets, entity schemas, systems, commands — but kept minimal so
 * tests + docs have one concrete thing to point at.
 *
 * The plugin does NOT declare dependencies on other plugins; it
 * purely contributes to the host-supplied registry. Tests drive the
 * full lifecycle through `createPluginHostFromRegistry` and assert
 * on `paletteRegistry.records()` before, during, and after enable.
 */

import type { HyperforgePlugin } from "../PluginLoader.js";
import type { PluginContextBase } from "../PluginHost.js";
import type { PluginContributionRegistry } from "../PluginContributionRegistry.js";

/**
 * Minimal palette category shape used by the reference plugin.
 * Real editor palette categories will be richer (icon, order, etc.);
 * this keeps the reference honest about the substrate contract.
 */
export interface PaletteCategory {
  readonly id: string;
  readonly label: string;
}

/**
 * Context shape the reference plugin expects. Callers assemble this
 * inside `buildContext(manifest, scope)` — the host doesn't care
 * what registries live on the context as long as `pluginId` and
 * `scope` are present.
 */
export interface PaletteContributionContext extends PluginContextBase {
  readonly paletteCategories: PluginContributionRegistry<PaletteCategory>;
}

/**
 * Build the reference plugin. Given the palette categories it
 * wants to contribute, returns a `HyperforgePlugin` that:
 *   - registers the categories into `ctx.paletteCategories` during
 *     `onEnable`
 *   - registers a scope disposer that calls
 *     `ctx.paletteCategories.unregisterAllForPlugin(ctx.pluginId)`
 *     so `onDisable` (via the scope drain installed by
 *     `PluginHost`) retracts the whole bundle atomically
 */
export function paletteContributionPlugin(
  categories: readonly PaletteCategory[],
): HyperforgePlugin<PaletteContributionContext> {
  return {
    onEnable(ctx) {
      ctx.paletteCategories.registerAll(ctx.pluginId, categories);
      ctx.scope.register(() =>
        ctx.paletteCategories.unregisterAllForPlugin(ctx.pluginId),
      );
    },
  };
}
