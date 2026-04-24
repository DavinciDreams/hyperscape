/**
 * AccessibilityProvider
 *
 * Singleton persistence layer for the authored accessibility
 * defaults manifest — font scale, color-blind mode, subtitles,
 * input-assist, reduced motion, etc. Mirrors the `TimeWeatherProvider`
 * pattern: holds a single object manifest (not an array).
 *
 * Unlike `TimeWeatherProvider`, every field on `AccessibilityManifest`
 * has a schema default, so an empty object `{}` is always a safe
 * fallback — the provider exposes `getManifest()` that returns a
 * fully-defaulted manifest when unloaded.
 */

import {
  AccessibilityManifestSchema,
  type AccessibilityManifest,
} from "@hyperforge/manifest-schema";

class AccessibilityProvider {
  private static _instance: AccessibilityProvider | null = null;
  private _manifest: AccessibilityManifest | null = null;

  public static getInstance(): AccessibilityProvider {
    if (!AccessibilityProvider._instance) {
      AccessibilityProvider._instance = new AccessibilityProvider();
    }
    return AccessibilityProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: AccessibilityManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): AccessibilityManifest {
    const parsed = AccessibilityManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: AccessibilityManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Current authored manifest, or a fully-defaulted one when not
   * loaded. Safe to call unconditionally — the schema supplies
   * defaults for every field, so UI consumers can read
   * `manifest.subtitles.scale` etc. without guarding.
   */
  public getManifest(): AccessibilityManifest {
    if (this._manifest !== null) {
      return this._manifest;
    }
    return AccessibilityManifestSchema.parse({});
  }
}

export { AccessibilityProvider };
export const accessibilityProvider = AccessibilityProvider.getInstance();
