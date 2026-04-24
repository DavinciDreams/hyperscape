/**
 * FishingProvider
 *
 * Singleton persistence layer for the authored fishing manifest —
 * fishing spot definitions (catch yields, level/tool gates, respawn
 * timings, catchLow/catchHigh rate bands). Authored at
 * `gathering/fishing.json`; schema is `FishingManifestSchema`.
 *
 * No safe baseline — `spots` array must be nonempty. Legacy DataManager
 * still parses inline and seeds `gatheringResources` + `resourcesMap`;
 * this provider gives a boot-load anchor for future rewire.
 */

import {
  FishingManifestSchema,
  type FishingManifest,
} from "@hyperforge/manifest-schema";

class FishingProvider {
  private static _instance: FishingProvider | null = null;
  private _manifest: FishingManifest | null = null;

  public static getInstance(): FishingProvider {
    if (!FishingProvider._instance) {
      FishingProvider._instance = new FishingProvider();
    }
    return FishingProvider._instance;
  }

  public load(manifest: FishingManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): FishingManifest {
    const parsed = FishingManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: FishingManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): FishingManifest | null {
    return this._manifest;
  }
}

export { FishingProvider };
export const fishingProvider = FishingProvider.getInstance();
