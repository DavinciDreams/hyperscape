/**
 * GatheringProvider
 *
 * Singleton persistence layer for the authored gathering manifest —
 * woodcutting/mining/fishing skill mechanics, ranges, timing,
 * tool interactions. Authored at `gathering-constants.json`;
 * schema is `GatheringManifestSchema`.
 *
 * No safe baseline — schema requires a full object. Runtime falls back
 * to legacy hardcoded `GatheringConstants` when provider is unloaded.
 */

import {
  GatheringManifestSchema,
  type GatheringManifest,
} from "@hyperforge/manifest-schema";

class GatheringProvider {
  private static _instance: GatheringProvider | null = null;
  private _manifest: GatheringManifest | null = null;

  public static getInstance(): GatheringProvider {
    if (!GatheringProvider._instance) {
      GatheringProvider._instance = new GatheringProvider();
    }
    return GatheringProvider._instance;
  }

  public load(manifest: GatheringManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): GatheringManifest {
    const parsed = GatheringManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: GatheringManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): GatheringManifest | null {
    return this._manifest;
  }
}

export { GatheringProvider };
export const gatheringProvider = GatheringProvider.getInstance();
