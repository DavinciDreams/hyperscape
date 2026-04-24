/**
 * HapticsProvider
 *
 * Singleton persistence layer for the authored haptics manifest —
 * controller rumble / touch / VR haptic pattern registry with
 * per-stage channel (low/high freq, triggers, mobile default),
 * amplitude envelopes (constant/linear/ease-*), per-pattern loop +
 * priority + cancellable metadata. Wraps the
 * `@hyperforge/manifest-schema` `HapticsManifestSchema` with
 * array-shape + safe-empty-default semantics. `getPatterns()` always
 * returns an array (possibly empty) so consumers can iterate without
 * branching on isLoaded().
 *
 * Runtime HapticsSystem is not yet shipped — this provider only
 * persists authored data for future consumption.
 */

import {
  HapticsManifestSchema,
  type HapticsManifest,
} from "@hyperforge/manifest-schema";

class HapticsProvider {
  private static _instance: HapticsProvider | null = null;
  private _manifest: HapticsManifest | null = null;

  public static getInstance(): HapticsProvider {
    if (!HapticsProvider._instance) {
      HapticsProvider._instance = new HapticsProvider();
    }
    return HapticsProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: HapticsManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): HapticsManifest {
    const parsed = HapticsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: HapticsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /** Safe-empty default: returns `[]` when no authored patterns are loaded. */
  public getPatterns(): HapticsManifest {
    return this._manifest ?? [];
  }

  public getManifest(): HapticsManifest | null {
    return this._manifest;
  }
}

export { HapticsProvider };
export const hapticsProvider = HapticsProvider.getInstance();
