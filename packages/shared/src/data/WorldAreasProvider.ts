/**
 * WorldAreasProvider
 *
 * Singleton persistence layer for the authored world-areas manifest —
 * 5-category area registry (starterTowns/level1-3/special) keyed by id.
 * Authored at `world-areas.json`; schema is `WorldAreasManifestSchema`.
 *
 * Safe baseline: 5 empty records (no areas).
 */

import {
  WorldAreasManifestSchema,
  type WorldAreasManifest,
} from "@hyperforge/manifest-schema";

class WorldAreasProvider {
  private static _instance: WorldAreasProvider | null = null;
  private _manifest: WorldAreasManifest | null = null;

  public static getInstance(): WorldAreasProvider {
    if (!WorldAreasProvider._instance) {
      WorldAreasProvider._instance = new WorldAreasProvider();
    }
    return WorldAreasProvider._instance;
  }

  public load(manifest: WorldAreasManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): WorldAreasManifest {
    const parsed = WorldAreasManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: WorldAreasManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): WorldAreasManifest | null {
    return this._manifest;
  }
}

export { WorldAreasProvider };
export const worldAreasProvider = WorldAreasProvider.getInstance();
