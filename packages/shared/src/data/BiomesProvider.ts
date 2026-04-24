/**
 * BiomesProvider
 *
 * Singleton persistence layer for the authored biomes manifest — array
 * of Biome registry entries (color schemes, vegetation layers, mob
 * populations, difficulty) consumed by world generation + terrain color.
 *
 * Baseline fixture is `[]` — no authored biomes.
 *
 * Runtime biome lookup wiring pending.
 */

import {
  BiomesManifestSchema,
  type BiomesManifest,
} from "@hyperforge/manifest-schema";

class BiomesProvider {
  private static _instance: BiomesProvider | null = null;
  private _manifest: BiomesManifest | null = null;

  public static getInstance(): BiomesProvider {
    if (!BiomesProvider._instance) {
      BiomesProvider._instance = new BiomesProvider();
    }
    return BiomesProvider._instance;
  }

  public load(manifest: BiomesManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): BiomesManifest {
    const parsed = BiomesManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: BiomesManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): BiomesManifest | null {
    return this._manifest;
  }
}

export { BiomesProvider };
export const biomesProvider = BiomesProvider.getInstance();
