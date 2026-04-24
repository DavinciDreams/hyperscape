/**
 * SaveDataProvider
 *
 * Singleton persistence layer for the authored save-data slice
 * manifest — plugin-contributed slices (character/account/world/
 * guild scope) with versioned single-step migrations and periodic-
 * snapshot toggle. Feeds the Apr-20 runtime `SaveDataMigrator` +
 * `SaveDataRegistry` on CharacterService (and friends) save/load.
 *
 * Array-shaped manifest with safe empty semantics: `getSlices()`
 * returns `[]` when unloaded so downstream systems see no authored
 * slices (and fall back to whatever the game always persisted).
 */

import {
  SaveDataManifestSchema,
  type SaveDataManifest,
} from "@hyperforge/manifest-schema";

class SaveDataProvider {
  private static _instance: SaveDataProvider | null = null;
  private _manifest: SaveDataManifest | null = null;

  public static getInstance(): SaveDataProvider {
    if (!SaveDataProvider._instance) {
      SaveDataProvider._instance = new SaveDataProvider();
    }
    return SaveDataProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: SaveDataManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): SaveDataManifest {
    const parsed = SaveDataManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: SaveDataManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /** Slice list, or `[]` when unloaded. */
  public getSlices(): SaveDataManifest {
    return this._manifest ?? [];
  }

  public getManifest(): SaveDataManifest | null {
    return this._manifest;
  }
}

export { SaveDataProvider };
export const saveDataProvider = SaveDataProvider.getInstance();
