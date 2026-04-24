/**
 * AmmunitionProvider
 *
 * Singleton persistence layer for the authored ammunition manifest —
 * bow tier ladder + arrow registry consumed by the ranged combat /
 * AmmunitionService runtime.
 *
 * No baseline fixture — `$schema` + bowTiers + arrows are required
 * without defaults.
 *
 * Runtime AmmunitionService migration off legacy loader pending.
 */

import {
  AmmunitionManifestSchema,
  type AmmunitionManifest,
} from "@hyperforge/manifest-schema";

class AmmunitionProvider {
  private static _instance: AmmunitionProvider | null = null;
  private _manifest: AmmunitionManifest | null = null;

  public static getInstance(): AmmunitionProvider {
    if (!AmmunitionProvider._instance) {
      AmmunitionProvider._instance = new AmmunitionProvider();
    }
    return AmmunitionProvider._instance;
  }

  public load(manifest: AmmunitionManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): AmmunitionManifest {
    const parsed = AmmunitionManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: AmmunitionManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): AmmunitionManifest | null {
    return this._manifest;
  }
}

export { AmmunitionProvider };
export const ammunitionProvider = AmmunitionProvider.getInstance();
