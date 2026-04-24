/**
 * WoodcuttingProvider
 *
 * Singleton persistence layer for the authored woodcutting manifest —
 * tree resource definitions (model variants, harvest yields, respawn
 * timings, tool + level requirements). Authored at
 * `gathering/woodcutting.json`; schema is `WoodcuttingManifestSchema`.
 *
 * No safe baseline — `trees` array must be nonempty. Legacy DataManager
 * still parses inline and seeds `gatheringResources` + `resourcesMap`;
 * this provider gives a boot-load anchor for future rewire.
 */

import {
  WoodcuttingManifestSchema,
  type WoodcuttingManifest,
} from "@hyperforge/manifest-schema";

class WoodcuttingProvider {
  private static _instance: WoodcuttingProvider | null = null;
  private _manifest: WoodcuttingManifest | null = null;

  public static getInstance(): WoodcuttingProvider {
    if (!WoodcuttingProvider._instance) {
      WoodcuttingProvider._instance = new WoodcuttingProvider();
    }
    return WoodcuttingProvider._instance;
  }

  public load(manifest: WoodcuttingManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): WoodcuttingManifest {
    const parsed = WoodcuttingManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: WoodcuttingManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): WoodcuttingManifest | null {
    return this._manifest;
  }
}

export { WoodcuttingProvider };
export const woodcuttingProvider = WoodcuttingProvider.getInstance();
