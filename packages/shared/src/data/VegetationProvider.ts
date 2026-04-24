/**
 * VegetationProvider
 *
 * Singleton persistence layer for the authored vegetation manifest
 * — versioned asset registry feeding procgen vegetation layers +
 * biome layer definitions.
 *
 * No baseline fixture — `version` + `assets` are required fields
 * without defaults. Absence leaves the provider unloaded.
 *
 * Runtime procgen vegetation layer already consumes a live manifest
 * indirectly through the procgen package; this provider is the
 * boot-load persistence layer for the authored source of truth.
 */

import {
  VegetationManifestSchema,
  type VegetationManifest,
} from "@hyperforge/manifest-schema";

class VegetationProvider {
  private static _instance: VegetationProvider | null = null;
  private _manifest: VegetationManifest | null = null;

  public static getInstance(): VegetationProvider {
    if (!VegetationProvider._instance) {
      VegetationProvider._instance = new VegetationProvider();
    }
    return VegetationProvider._instance;
  }

  public load(manifest: VegetationManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): VegetationManifest {
    const parsed = VegetationManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: VegetationManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): VegetationManifest | null {
    return this._manifest;
  }
}

export { VegetationProvider };
export const vegetationProvider = VegetationProvider.getInstance();
