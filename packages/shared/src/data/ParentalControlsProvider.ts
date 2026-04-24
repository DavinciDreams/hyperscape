/**
 * ParentalControlsProvider
 *
 * Singleton persistence layer for the authored parental-controls
 * manifest — age-gated profiles (minAccountAgeYears + optional
 * maxExclusive, priority tiebreak) bundling 4 rule blocks (playTime,
 * spend, communication, content), plus a guardian workflow policy.
 * Wraps the `@hyperforge/manifest-schema`
 * `ParentalControlsManifestSchema` with null-when-unloaded semantics.
 * When `enabled=true` the schema requires at least one profile, so an
 * empty `{}` blob is schema-invalid; a `{enabled: false}` baseline
 * fixture keeps the pipeline inert until author opts in.
 *
 * Runtime ParentalControlsSystem is not yet shipped — this provider
 * only persists authored data for future consumption.
 */

import {
  ParentalControlsManifestSchema,
  type ParentalControlsManifest,
} from "@hyperforge/manifest-schema";

class ParentalControlsProvider {
  private static _instance: ParentalControlsProvider | null = null;
  private _manifest: ParentalControlsManifest | null = null;

  public static getInstance(): ParentalControlsProvider {
    if (!ParentalControlsProvider._instance) {
      ParentalControlsProvider._instance = new ParentalControlsProvider();
    }
    return ParentalControlsProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: ParentalControlsManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): ParentalControlsManifest {
    const parsed = ParentalControlsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: ParentalControlsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ParentalControlsManifest | null {
    return this._manifest;
  }
}

export { ParentalControlsProvider };
export const parentalControlsProvider = ParentalControlsProvider.getInstance();
