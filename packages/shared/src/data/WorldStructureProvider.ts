/**
 * WorldStructureProvider
 *
 * Singleton persistence layer for the authored world-structure manifest —
 * high-level world constants, spawn bounds, tile/region metadata.
 * Authored at `world-structure.json`; schema is `WorldStructureManifestSchema`.
 *
 * No safe baseline — schema requires a full object. Runtime falls back
 * to legacy hardcoded `WorldStructureConstants` when provider is unloaded.
 */

import {
  WorldStructureManifestSchema,
  type WorldStructureManifest,
} from "@hyperforge/manifest-schema";

class WorldStructureProvider {
  private static _instance: WorldStructureProvider | null = null;
  private _manifest: WorldStructureManifest | null = null;

  public static getInstance(): WorldStructureProvider {
    if (!WorldStructureProvider._instance) {
      WorldStructureProvider._instance = new WorldStructureProvider();
    }
    return WorldStructureProvider._instance;
  }

  public load(manifest: WorldStructureManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): WorldStructureManifest {
    const parsed = WorldStructureManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: WorldStructureManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): WorldStructureManifest | null {
    return this._manifest;
  }
}

export { WorldStructureProvider };
export const worldStructureProvider = WorldStructureProvider.getInstance();
