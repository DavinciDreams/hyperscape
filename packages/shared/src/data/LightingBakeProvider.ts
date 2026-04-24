/**
 * LightingBakeProvider
 *
 * Singleton persistence layer for the authored lighting-bake
 * manifest — offline bake settings (lightmaps/probes/AO/GI) with
 * per-sublevel overrides, lightprobe-volume unique-id refinement,
 * power-of-two atlas-size refinement, `skipBake` dev-iteration
 * toggle.
 *
 * Baseline fixture is `{}` — every field has a default.
 *
 * Runtime offline baker pending.
 */

import {
  LightingBakeManifestSchema,
  type LightingBakeManifest,
} from "@hyperforge/manifest-schema";

class LightingBakeProvider {
  private static _instance: LightingBakeProvider | null = null;
  private _manifest: LightingBakeManifest | null = null;

  public static getInstance(): LightingBakeProvider {
    if (!LightingBakeProvider._instance) {
      LightingBakeProvider._instance = new LightingBakeProvider();
    }
    return LightingBakeProvider._instance;
  }

  public load(manifest: LightingBakeManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): LightingBakeManifest {
    const parsed = LightingBakeManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: LightingBakeManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): LightingBakeManifest | null {
    return this._manifest;
  }
}

export { LightingBakeProvider };
export const lightingBakeProvider = LightingBakeProvider.getInstance();
