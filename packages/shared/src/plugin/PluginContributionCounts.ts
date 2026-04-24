/**
 * Live plugin-contribution counts.
 *
 * `PluginBrowserRow.contributions` reports the counts advertised in
 * the manifest (authoring truth). Real-world runtime counts can
 * diverge when:
 *   - a plugin has not yet been enabled (registry empty despite
 *     manifest.contributions listing items)
 *   - a plugin registers items conditionally at enable time
 *   - the author forgot to declare contributions in the manifest
 *
 * For the Plugin Browser's "live contributions" column we want the
 * actual count from each registry, summed per plugin id. This
 * helper walks any set of `PluginContributionRegistry` instances
 * by `kind` name and produces a plain record the editor can render.
 *
 * Pure-logic; registries are not mutated.
 */

import type { PluginContributionRegistry } from "./PluginContributionRegistry.js";

/** Snapshot of live contribution counts for one plugin. */
export type LivePluginContributionCounts = Record<string, number>;

/**
 * Narrow accessor surface needed from each registry. Declared here
 * so callers can pass in mocks or alternate implementations during
 * tests — the only thing we need is `idsForPlugin` + `kind`.
 */
interface CountableRegistry {
  readonly kind: string;
  idsForPlugin(pluginId: string): readonly string[];
}

// `PluginContributionRegistry<T>` exposes `kind` and `idsForPlugin`
// publicly; this alias lets callers pass real registries while the
// internal shape stays narrow.
type ReadableRegistry = CountableRegistry | PluginContributionRegistry<unknown>;

/**
 * Count live contributions for a single plugin across a set of
 * registries. Each registry's `kind` becomes a key; `registries`
 * entries that share a `kind` are summed so callers can pass two
 * sibling instances and have them roll up.
 *
 * Keys for which the plugin owns zero items are still emitted with
 * `0`, so the editor can render a stable column set.
 */
export function countLiveContributionsForPlugin(
  pluginId: string,
  registries: readonly ReadableRegistry[],
): LivePluginContributionCounts {
  const out: LivePluginContributionCounts = {};
  for (const reg of registries) {
    const key = reg.kind;
    const count = reg.idsForPlugin(pluginId).length;
    out[key] = (out[key] ?? 0) + count;
  }
  return out;
}

/**
 * Fan-out version: returns `{ [pluginId]: LivePluginContributionCounts }`
 * for an explicit set of plugin ids. The id list typically comes from
 * `catalog.ids`. Plugins that own zero items across every registry
 * still appear in the result with each count at `0`, so the editor
 * can render a uniform column set.
 */
export function countLiveContributionsForPlugins(
  pluginIds: readonly string[],
  registries: readonly ReadableRegistry[],
): Record<string, LivePluginContributionCounts> {
  const result: Record<string, LivePluginContributionCounts> = {};
  for (const id of pluginIds) {
    result[id] = countLiveContributionsForPlugin(id, registries);
  }
  return result;
}
