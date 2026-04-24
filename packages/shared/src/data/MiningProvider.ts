/**
 * MiningProvider
 *
 * Singleton persistence layer for the authored mining manifest —
 * rock resource definitions (ore yields, gem drops, respawn timings,
 * pickaxe + level requirements). Authored at `gathering/mining.json`;
 * schema is `MiningManifestSchema`.
 *
 * No safe baseline — `rocks` array must be nonempty. Legacy DataManager
 * still parses inline and seeds `gatheringResources` + `resourcesMap`;
 * this provider gives a boot-load anchor for future rewire.
 */

import {
  MiningManifestSchema,
  type MiningManifest,
} from "@hyperforge/manifest-schema";

class MiningProvider {
  private static _instance: MiningProvider | null = null;
  private _manifest: MiningManifest | null = null;

  public static getInstance(): MiningProvider {
    if (!MiningProvider._instance) {
      MiningProvider._instance = new MiningProvider();
    }
    return MiningProvider._instance;
  }

  public load(manifest: MiningManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): MiningManifest {
    const parsed = MiningManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: MiningManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): MiningManifest | null {
    return this._manifest;
  }
}

export { MiningProvider };
export const miningProvider = MiningProvider.getInstance();
