/**
 * TimeWeatherProvider
 *
 * Singleton persistence layer for the authored time-of-day + weather
 * manifest. Mirrors the `LocalizationProvider` pattern: holds a single
 * object manifest (not an array) that consumers (typically a
 * `TimeWeatherDriver` or `WorldEnvironmentSystem`) feed through their
 * own per-world instance.
 *
 * Kept separate from the runtime driver so validation runs at the
 * edge and the provider stays dependency-free.
 */

import {
  TimeWeatherManifestSchema,
  type TimeWeatherManifest,
} from "@hyperforge/manifest-schema";

class TimeWeatherProvider {
  private static _instance: TimeWeatherProvider | null = null;
  private _manifest: TimeWeatherManifest | null = null;

  public static getInstance(): TimeWeatherProvider {
    if (!TimeWeatherProvider._instance) {
      TimeWeatherProvider._instance = new TimeWeatherProvider();
    }
    return TimeWeatherProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: TimeWeatherManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): TimeWeatherManifest {
    const parsed = TimeWeatherManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: TimeWeatherManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Current authored manifest, or `null` when not loaded. Unlike the
   * array-shaped providers there is no safe "empty" fallback — a
   * day/night cycle requires at least two keyframes and a weather
   * manifest requires at least one state, so consumers must
   * `isLoaded()`-guard or supply their own hardcoded fallback.
   */
  public getManifest(): TimeWeatherManifest | null {
    return this._manifest;
  }
}

export { TimeWeatherProvider };
export const timeWeatherProvider = TimeWeatherProvider.getInstance();
