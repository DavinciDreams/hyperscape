/**
 * NPCSizesProvider
 *
 * Singleton persistence layer for the authored npc-sizes manifest —
 * NPC footprint dimensions keyed by NPC id, consumed by tile-grid
 * collision + pathing.
 *
 * Baseline fixture is
 * `{"$schema":"hyperforge.npc-sizes.v1","sizes":{}}` — empty size map
 * is schema-valid. Runtime falls back to legacy hardcoded sizes when
 * provider is unloaded or lookup misses.
 */

import {
  NPCSizesManifestSchema,
  type NPCSizesManifest,
} from "@hyperforge/manifest-schema";

class NPCSizesProvider {
  private static _instance: NPCSizesProvider | null = null;
  private _manifest: NPCSizesManifest | null = null;

  public static getInstance(): NPCSizesProvider {
    if (!NPCSizesProvider._instance) {
      NPCSizesProvider._instance = new NPCSizesProvider();
    }
    return NPCSizesProvider._instance;
  }

  public load(manifest: NPCSizesManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): NPCSizesManifest {
    const parsed = NPCSizesManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: NPCSizesManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): NPCSizesManifest | null {
    return this._manifest;
  }
}

export { NPCSizesProvider };
export const npcSizesProvider = NPCSizesProvider.getInstance();
