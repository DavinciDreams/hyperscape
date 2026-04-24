/**
 * WorldConfigProvider
 *
 * Singleton persistence layer for the authored world-config manifest —
 * terrain/zoneTier/spawn rules defining worldSize, waterThreshold, tileSize.
 * Authored at `world-config.json`; schema is `WorldConfigManifestSchema`.
 *
 * No safe baseline — requires terrain block. Complements the legacy
 * `DataManager.setWorldConfig()` static setter which pre-dated this provider.
 */

import {
  WorldConfigManifestSchema,
  type WorldConfigManifest,
} from "@hyperforge/manifest-schema";

class WorldConfigProvider {
  private static _instance: WorldConfigProvider | null = null;
  private _manifest: WorldConfigManifest | null = null;

  public static getInstance(): WorldConfigProvider {
    if (!WorldConfigProvider._instance) {
      WorldConfigProvider._instance = new WorldConfigProvider();
    }
    return WorldConfigProvider._instance;
  }

  public load(manifest: WorldConfigManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): WorldConfigManifest {
    const parsed = WorldConfigManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: WorldConfigManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): WorldConfigManifest | null {
    return this._manifest;
  }
}

export { WorldConfigProvider };
export const worldConfigProvider = WorldConfigProvider.getInstance();
