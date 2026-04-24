/**
 * PluginRegistryProvider
 *
 * Singleton persistence layer for the per-install plugin registry —
 * the list of plugins this project has installed, plus optional
 * `enabledByDefault` overrides keyed by plugin id.
 *
 * Authored at `plugin-registry.json` (top level of the world-assets
 * directory — one entry per project). Schema is
 * `PluginRegistryManifestSchema`.
 *
 * Safe baseline: `{}` — parses into `{ plugins: [], enabledByDefault: {} }`.
 *
 * Separation: this provider describes what's *installed* at the
 * project scope. Each plugin's own `plugin.json` is handled separately
 * during plugin load; the registry is just the aggregate index.
 */

import {
  PluginRegistryManifestSchema,
  type PluginRegistryManifest,
} from "@hyperforge/manifest-schema";

class PluginRegistryProvider {
  private static _instance: PluginRegistryProvider | null = null;
  private _manifest: PluginRegistryManifest | null = null;

  public static getInstance(): PluginRegistryProvider {
    if (!PluginRegistryProvider._instance) {
      PluginRegistryProvider._instance = new PluginRegistryProvider();
    }
    return PluginRegistryProvider._instance;
  }

  public load(manifest: PluginRegistryManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): PluginRegistryManifest {
    const parsed = PluginRegistryManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: PluginRegistryManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): PluginRegistryManifest | null {
    return this._manifest;
  }
}

export { PluginRegistryProvider };
export const pluginRegistryProvider = PluginRegistryProvider.getInstance();
