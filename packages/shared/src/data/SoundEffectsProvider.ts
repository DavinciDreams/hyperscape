/**
 * SoundEffectsProvider
 *
 * Singleton persistence layer for the authored SFX manifest — array
 * of SoundEffect registry entries that the (forthcoming) AudioSystem
 * + 2D/3D spatial layer use to play named sound cues.
 *
 * Baseline fixture is `[]` — no authored sounds.
 *
 * Runtime SFX playback not yet shipped.
 */

import {
  SoundEffectManifestSchema,
  type SoundEffectManifest,
} from "@hyperforge/manifest-schema";

class SoundEffectsProvider {
  private static _instance: SoundEffectsProvider | null = null;
  private _manifest: SoundEffectManifest | null = null;

  public static getInstance(): SoundEffectsProvider {
    if (!SoundEffectsProvider._instance) {
      SoundEffectsProvider._instance = new SoundEffectsProvider();
    }
    return SoundEffectsProvider._instance;
  }

  public load(manifest: SoundEffectManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): SoundEffectManifest {
    const parsed = SoundEffectManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: SoundEffectManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): SoundEffectManifest | null {
    return this._manifest;
  }
}

export { SoundEffectsProvider };
export const soundEffectsProvider = SoundEffectsProvider.getInstance();
