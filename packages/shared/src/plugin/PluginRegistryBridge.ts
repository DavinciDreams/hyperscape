/**
 * Plugin registry → runtime bridge.
 *
 * Pure-logic helpers that turn a parsed `PluginRegistryManifest` into
 * the runtime primitives (`PluginCatalog`) expected by `PluginHost` /
 * `PluginLoader`, and resolve the effective enabled-by-default state
 * for a given plugin id.
 *
 * Separation: the registry manifest lives in `@hyperforge/manifest-schema`,
 * the runtime primitives live in `./PluginCatalog` / `./PluginLoader`.
 * This file is the thin adapter between the two. No IO, no world
 * handle — world-boot wiring belongs elsewhere.
 */

import type {
  PluginManifest,
  PluginRegistryManifest,
} from "@hyperforge/manifest-schema";
import { PluginCatalog } from "./PluginCatalog.js";

/**
 * Build a `PluginCatalog` from a loaded plugin-registry manifest.
 *
 * The returned catalog only knows about manifests; downstream
 * `PluginLoader` / `PluginHost` are still responsible for registering
 * factories and driving the lifecycle. Throws the same errors as
 * `PluginCatalog` (duplicate ids, etc.) — the registry schema's
 * `unique plugin ids` refinement makes duplicates impossible in
 * practice, but the catalog re-checks defensively.
 */
export function buildPluginCatalogFromRegistry(
  manifest: PluginRegistryManifest,
): PluginCatalog {
  return new PluginCatalog(manifest.plugins);
}

/**
 * Resolve the effective "should this plugin be enabled by default?"
 * flag for `pluginId` given a registry manifest.
 *
 * Precedence (highest wins):
 *   1. `manifest.enabledByDefault[pluginId]` — explicit project-level
 *      override. Useful when a project wants to ship a bundled plugin
 *      disabled without editing its vendored `plugin.json`.
 *   2. The plugin's own `enabledByDefault` field from its
 *      `PluginManifest` (default `true`).
 *
 * Throws if `pluginId` is not present in the registry — callers
 * should only ask about plugins they know about.
 */
export function resolvePluginEnabledByDefault(
  manifest: PluginRegistryManifest,
  pluginId: string,
): boolean {
  const plugin = findPlugin(manifest, pluginId);
  const override = manifest.enabledByDefault[pluginId];
  if (typeof override === "boolean") return override;
  return plugin.enabledByDefault;
}

/**
 * Return the ids of plugins that should come up enabled on boot, in
 * manifest order. Callers pair this with `PluginCatalog.loadOrder()`
 * + `PluginHost.enableAll()` to only enable the subset they care about.
 */
export function listPluginsEnabledByDefault(
  manifest: PluginRegistryManifest,
): string[] {
  return manifest.plugins
    .filter((p) => resolvePluginEnabledByDefault(manifest, p.id))
    .map((p) => p.id);
}

function findPlugin(
  manifest: PluginRegistryManifest,
  pluginId: string,
): PluginManifest {
  const hit = manifest.plugins.find((p) => p.id === pluginId);
  if (!hit) {
    throw new Error(
      `plugin "${pluginId}" is not present in the registry (known ids: ${
        manifest.plugins.length > 0
          ? manifest.plugins.map((p) => p.id).join(", ")
          : "(empty)"
      })`,
    );
  }
  return hit;
}
