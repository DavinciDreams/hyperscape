/**
 * MusicProvider
 *
 * Singleton persistence layer for the authored music manifest — array
 * of MusicTrack registry entries consumed by the runtime music selector
 * for background tracks (intro/ambient/combat).
 *
 * Baseline fixture is `[]` — no authored tracks.
 *
 * Runtime music selector wiring pending.
 */

import {
  MusicManifestSchema,
  type MusicManifest,
} from "@hyperforge/manifest-schema";

class MusicProvider {
  private static _instance: MusicProvider | null = null;
  private _manifest: MusicManifest | null = null;

  public static getInstance(): MusicProvider {
    if (!MusicProvider._instance) {
      MusicProvider._instance = new MusicProvider();
    }
    return MusicProvider._instance;
  }

  public load(manifest: MusicManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): MusicManifest {
    const parsed = MusicManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: MusicManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): MusicManifest | null {
    return this._manifest;
  }
}

export { MusicProvider };
export const musicProvider = MusicProvider.getInstance();
