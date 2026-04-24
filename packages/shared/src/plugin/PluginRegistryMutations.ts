/**
 * Plugin registry mutations.
 *
 * Pure-logic immutable transforms over `PluginRegistryManifest`.
 * Every helper returns a fresh manifest — input objects are never
 * mutated — so callers can safely pipe the result into Zod's
 * `.parse()` for re-validation before persisting to disk.
 *
 * These are the narrow set of operations the editor actually needs
 * to perform on the installed-plugins registry:
 *   - Toggle a plugin's enabled-by-default flag (add/update override)
 *   - Revert a toggle (remove override → plugin's own flag applies)
 *   - Add a manifest to the registry (new install)
 *   - Remove a manifest from the registry (uninstall) and clean
 *     any dangling enabled overrides at the same time
 *
 * No side effects. No disk I/O. The editor's save pipeline layers
 * this below the Zod parse + persistence tee.
 */

import type {
  PluginManifest,
  PluginRegistryManifest,
} from "@hyperforge/manifest-schema";

export class DuplicatePluginIdError extends Error {
  readonly pluginId: string;
  constructor(pluginId: string) {
    super(`plugin id "${pluginId}" is already in the registry`);
    this.name = "DuplicatePluginIdError";
    this.pluginId = pluginId;
  }
}

export class UnknownPluginIdError extends Error {
  readonly pluginId: string;
  readonly availableIds: readonly string[];
  constructor(pluginId: string, availableIds: readonly string[]) {
    super(
      `plugin id "${pluginId}" not in registry; available: ${availableIds.join(", ") || "<none>"}`,
    );
    this.name = "UnknownPluginIdError";
    this.pluginId = pluginId;
    this.availableIds = availableIds;
  }
}

/**
 * Set an explicit enabled-by-default override for `pluginId`. The
 * plugin must already be in the registry; throws `UnknownPluginIdError`
 * otherwise (silent no-ops would cause the editor to drop toggles
 * for stale ids without warning).
 */
export function setPluginEnabledOverride(
  registry: PluginRegistryManifest,
  pluginId: string,
  enabled: boolean,
): PluginRegistryManifest {
  if (!registry.plugins.some((p) => p.id === pluginId)) {
    throw new UnknownPluginIdError(
      pluginId,
      registry.plugins.map((p) => p.id),
    );
  }
  return {
    ...registry,
    enabledByDefault: {
      ...registry.enabledByDefault,
      [pluginId]: enabled,
    },
  };
}

/**
 * Remove an enabled-by-default override for `pluginId`. After this,
 * `resolvePluginEnabledByDefault(registry, id)` falls through to
 * the plugin's own `enabledByDefault` flag. Unknown ids are
 * tolerated silently (revert of a stale override should not error).
 */
export function clearPluginEnabledOverride(
  registry: PluginRegistryManifest,
  pluginId: string,
): PluginRegistryManifest {
  if (!(pluginId in registry.enabledByDefault)) return registry;
  const next: Record<string, boolean> = {};
  for (const [id, enabled] of Object.entries(registry.enabledByDefault)) {
    if (id === pluginId) continue;
    next[id] = enabled;
  }
  return { ...registry, enabledByDefault: next };
}

/**
 * Append a manifest to the registry. Throws `DuplicatePluginIdError`
 * if a plugin with the same id is already installed — the editor's
 * "install" UI path is responsible for prompting the user to
 * upgrade/replace instead of silently overwriting a dev-mode build.
 */
export function addPluginToRegistry(
  registry: PluginRegistryManifest,
  manifest: PluginManifest,
): PluginRegistryManifest {
  if (registry.plugins.some((p) => p.id === manifest.id)) {
    throw new DuplicatePluginIdError(manifest.id);
  }
  return {
    ...registry,
    plugins: [...registry.plugins, manifest],
  };
}

/**
 * Remove a manifest from the registry by id. Also drops any dangling
 * enabled override for that id so the resulting manifest stays
 * internally consistent. Returns the registry unchanged if the id is
 * already absent (idempotent uninstall).
 */
export function removePluginFromRegistry(
  registry: PluginRegistryManifest,
  pluginId: string,
): PluginRegistryManifest {
  const plugins = registry.plugins.filter((p) => p.id !== pluginId);
  if (plugins.length === registry.plugins.length) {
    // Not present; still scrub any stale override just in case.
    if (!(pluginId in registry.enabledByDefault)) return registry;
  }
  const enabledByDefault: Record<string, boolean> = {};
  for (const [id, enabled] of Object.entries(registry.enabledByDefault)) {
    if (id === pluginId) continue;
    enabledByDefault[id] = enabled;
  }
  return { ...registry, plugins, enabledByDefault };
}

/**
 * Replace a manifest with a new one at the same id. Preserves
 * position in `plugins[]` (so the editor's authored order is stable
 * across upgrades) and preserves the enabled-by-default override
 * attached to the id. Throws `UnknownPluginIdError` if the id is
 * not already in the registry.
 */
export function replacePluginInRegistry(
  registry: PluginRegistryManifest,
  manifest: PluginManifest,
): PluginRegistryManifest {
  const idx = registry.plugins.findIndex((p) => p.id === manifest.id);
  if (idx < 0) {
    throw new UnknownPluginIdError(
      manifest.id,
      registry.plugins.map((p) => p.id),
    );
  }
  const plugins = [...registry.plugins];
  plugins[idx] = manifest;
  return { ...registry, plugins };
}
