/**
 * VfxProvider
 *
 * Singleton persistence layer for the authored VFX manifest — array
 * of VfxEffect registry entries that the (forthcoming) VFX spawner
 * uses to play named visual effects.
 *
 * Baseline fixture is `[]` — no authored effects.
 *
 * Runtime VFX spawner not yet shipped.
 */

import {
  VfxManifestSchema,
  type VfxManifest,
} from "@hyperforge/manifest-schema";

class VfxProvider {
  private static _instance: VfxProvider | null = null;
  private _manifest: VfxManifest | null = null;

  public static getInstance(): VfxProvider {
    if (!VfxProvider._instance) {
      VfxProvider._instance = new VfxProvider();
    }
    return VfxProvider._instance;
  }

  public load(manifest: VfxManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): VfxManifest {
    const parsed = VfxManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: VfxManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): VfxManifest | null {
    return this._manifest;
  }
}

export { VfxProvider };
export const vfxProvider = VfxProvider.getInstance();
