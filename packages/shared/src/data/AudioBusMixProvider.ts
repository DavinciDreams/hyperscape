/**
 * AudioBusMixProvider
 *
 * Singleton persistence layer for the authored audio-bus-mix
 * manifest — master + bus DAG (music/sfx/ui/ambient/etc.) with
 * per-bus volume/mute/solo/filters + sparse duck rules. Feeds the
 * Apr-20 runtime `AudioBusMixer` on world construction.
 *
 * Object-shaped manifest with a min-1-bus invariant: `getManifest()`
 * returns `null` when unloaded — there is no safe empty default.
 */

import {
  AudioBusMixManifestSchema,
  type AudioBusMixManifest,
} from "@hyperforge/manifest-schema";

class AudioBusMixProvider {
  private static _instance: AudioBusMixProvider | null = null;
  private _manifest: AudioBusMixManifest | null = null;

  public static getInstance(): AudioBusMixProvider {
    if (!AudioBusMixProvider._instance) {
      AudioBusMixProvider._instance = new AudioBusMixProvider();
    }
    return AudioBusMixProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: AudioBusMixManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): AudioBusMixManifest {
    const parsed = AudioBusMixManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: AudioBusMixManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Full bus graph + duck rules, or `null` when unloaded.
   * The schema requires `buses.min(1)`, so there is no safe
   * empty default — consumers must `isLoaded()`-guard or supply
   * their own fallback mix.
   */
  public getManifest(): AudioBusMixManifest | null {
    return this._manifest;
  }
}

export { AudioBusMixProvider };
export const audioBusMixProvider = AudioBusMixProvider.getInstance();
