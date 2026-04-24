/**
 * RenderProfilesProvider
 *
 * Singleton persistence layer for the authored render-profile
 * manifest — per-profile tone mapping, bloom, fog, ambient, environment
 * map, and color-grading settings. Mirrors the array-shaped provider
 * pattern (combat-tuning, loot-tables, xp-curves, etc.).
 *
 * The runtime `RenderProfileRegistry` (already shipped in the
 * Apr-20 runtime-consumers batch) consumes the manifest shape
 * directly once loaded from the provider.
 */

import {
  RenderProfileManifestSchema,
  type RenderProfileManifest,
} from "@hyperforge/manifest-schema";

class RenderProfilesProvider {
  private static _instance: RenderProfilesProvider | null = null;
  private _manifest: RenderProfileManifest | null = null;

  public static getInstance(): RenderProfilesProvider {
    if (!RenderProfilesProvider._instance) {
      RenderProfilesProvider._instance = new RenderProfilesProvider();
    }
    return RenderProfilesProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: RenderProfileManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): RenderProfileManifest {
    const parsed = RenderProfileManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: RenderProfileManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Profile list. Returns `null` when unloaded — the schema
   * requires `min(1)`, so there is no safe empty array.
   * Consumers must `isLoaded()`-guard or supply their own default.
   */
  public getManifest(): RenderProfileManifest | null {
    return this._manifest;
  }
}

export { RenderProfilesProvider };
export const renderProfilesProvider = RenderProfilesProvider.getInstance();
