/**
 * LODSettingsProvider
 *
 * Singleton persistence layer for the authored LOD-settings
 * manifest — versioned distance-threshold record + dissolve rules
 * for LOD crossfades.
 *
 * No baseline fixture — `version`, `distanceThresholds`, and
 * `dissolve` are all required fields without defaults. Absence
 * leaves the provider unloaded.
 *
 * Runtime LOD compositor not yet shipped.
 */

import {
  LODSettingsManifestSchema,
  type LODSettingsManifest,
} from "@hyperforge/manifest-schema";

class LODSettingsProvider {
  private static _instance: LODSettingsProvider | null = null;
  private _manifest: LODSettingsManifest | null = null;

  public static getInstance(): LODSettingsProvider {
    if (!LODSettingsProvider._instance) {
      LODSettingsProvider._instance = new LODSettingsProvider();
    }
    return LODSettingsProvider._instance;
  }

  public load(manifest: LODSettingsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): LODSettingsManifest {
    const parsed = LODSettingsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: LODSettingsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): LODSettingsManifest | null {
    return this._manifest;
  }
}

export { LODSettingsProvider };
export const lodSettingsProvider = LODSettingsProvider.getInstance();
