/**
 * MusicStateMachineProvider
 *
 * Singleton persistence layer for the authored dynamic-music
 * state-machine manifest — exploration → combat → boss → victory
 * state graphs with predicate-gated transitions, equal-power
 * crossfades, stingers, and bar quantization. Feeds the Apr-20
 * runtime `MusicStateController` + `MusicStateMachineRegistry` on
 * world construction.
 *
 * Array-shaped manifest with safe empty semantics: `getMachines()`
 * returns `[]` when unloaded so the registry has no entries and the
 * audio layer stays silent (or falls back to whatever the music
 * manifest's default is).
 */

import {
  MusicStateMachineManifestSchema,
  type MusicStateMachineManifest,
} from "@hyperforge/manifest-schema";

class MusicStateMachineProvider {
  private static _instance: MusicStateMachineProvider | null = null;
  private _manifest: MusicStateMachineManifest | null = null;

  public static getInstance(): MusicStateMachineProvider {
    if (!MusicStateMachineProvider._instance) {
      MusicStateMachineProvider._instance = new MusicStateMachineProvider();
    }
    return MusicStateMachineProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: MusicStateMachineManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): MusicStateMachineManifest {
    const parsed = MusicStateMachineManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: MusicStateMachineManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /** State-machine list, or `[]` when unloaded. */
  public getMachines(): MusicStateMachineManifest {
    return this._manifest ?? [];
  }

  public getManifest(): MusicStateMachineManifest | null {
    return this._manifest;
  }
}

export { MusicStateMachineProvider };
export const musicStateMachineProvider =
  MusicStateMachineProvider.getInstance();
