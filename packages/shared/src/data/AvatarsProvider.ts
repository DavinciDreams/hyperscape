/**
 * AvatarsProvider
 *
 * Singleton persistence layer for the authored avatars manifest —
 * character avatar catalog + LOD distance thresholds consumed by the
 * avatar preview + character creation runtime.
 *
 * No baseline fixture — `avatars` requires `min(1)` and `lodDistances`
 * is required without defaults.
 *
 * Runtime avatar loader wiring pending.
 */

import {
  AvatarsManifestSchema,
  type AvatarsManifest,
} from "@hyperforge/manifest-schema";

class AvatarsProvider {
  private static _instance: AvatarsProvider | null = null;
  private _manifest: AvatarsManifest | null = null;

  public static getInstance(): AvatarsProvider {
    if (!AvatarsProvider._instance) {
      AvatarsProvider._instance = new AvatarsProvider();
    }
    return AvatarsProvider._instance;
  }

  public load(manifest: AvatarsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): AvatarsManifest {
    const parsed = AvatarsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: AvatarsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): AvatarsManifest | null {
    return this._manifest;
  }
}

export { AvatarsProvider };
export const avatarsProvider = AvatarsProvider.getInstance();
