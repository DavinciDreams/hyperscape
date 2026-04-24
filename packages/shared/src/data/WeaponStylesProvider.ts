/**
 * WeaponStylesProvider
 *
 * Singleton persistence layer for the authored weapon-styles manifest —
 * OSRS-accurate combat style availability table keyed by weapon type.
 *
 * No baseline fixture — schema uses `z.record(WeaponTypeIdSchema, ...)`
 * which in Zod v4 requires an entry for every enum value. Runtime falls
 * back to legacy WeaponStyleConfig when provider is unloaded.
 */

import {
  WeaponStylesManifestSchema,
  type WeaponStylesManifest,
} from "@hyperforge/manifest-schema";

class WeaponStylesProvider {
  private static _instance: WeaponStylesProvider | null = null;
  private _manifest: WeaponStylesManifest | null = null;

  public static getInstance(): WeaponStylesProvider {
    if (!WeaponStylesProvider._instance) {
      WeaponStylesProvider._instance = new WeaponStylesProvider();
    }
    return WeaponStylesProvider._instance;
  }

  public load(manifest: WeaponStylesManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): WeaponStylesManifest {
    const parsed = WeaponStylesManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: WeaponStylesManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): WeaponStylesManifest | null {
    return this._manifest;
  }
}

export { WeaponStylesProvider };
export const weaponStylesProvider = WeaponStylesProvider.getInstance();
