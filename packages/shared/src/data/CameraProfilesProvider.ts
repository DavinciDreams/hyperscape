/**
 * CameraProfilesProvider
 *
 * Singleton persistence layer for authored camera rig profiles
 * (first-person, third-person, top-down, orbit, free-fly) plus
 * their FOV / lag / collision tuning. Feeds the Apr-20 runtime
 * `CameraProfileRegistry` on world construction.
 *
 * Array-shaped manifest with safe empty semantics: `getProfiles()`
 * returns `[]` when unloaded so consumers can iterate without an
 * isLoaded guard.
 */

import {
  CameraProfilesManifestSchema,
  type CameraProfilesManifest,
} from "@hyperforge/manifest-schema";

class CameraProfilesProvider {
  private static _instance: CameraProfilesProvider | null = null;
  private _manifest: CameraProfilesManifest | null = null;

  public static getInstance(): CameraProfilesProvider {
    if (!CameraProfilesProvider._instance) {
      CameraProfilesProvider._instance = new CameraProfilesProvider();
    }
    return CameraProfilesProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: CameraProfilesManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): CameraProfilesManifest {
    const parsed = CameraProfilesManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: CameraProfilesManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /** Array of camera profiles, or `[]` when unloaded. */
  public getProfiles(): CameraProfilesManifest {
    return this._manifest ?? [];
  }

  public getManifest(): CameraProfilesManifest | null {
    return this._manifest;
  }
}

export { CameraProfilesProvider };
export const cameraProfilesProvider = CameraProfilesProvider.getInstance();
