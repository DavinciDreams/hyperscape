/**
 * CombatProvider
 *
 * Singleton persistence layer for the authored combat manifest —
 * ranges, ticks, food timing, hit delays, projectile arcs, rotation
 * tolerances, aggro, level caps, attack-style tables. Authored at
 * `combat-constants.json`; schema is `CombatManifestSchema`.
 *
 * No safe baseline — schema requires a full object. Runtime falls back
 * to legacy hardcoded `CombatConstants` when provider is unloaded.
 */

import {
  CombatManifestSchema,
  type CombatManifest,
} from "@hyperforge/manifest-schema";

class CombatProvider {
  private static _instance: CombatProvider | null = null;
  private _manifest: CombatManifest | null = null;

  public static getInstance(): CombatProvider {
    if (!CombatProvider._instance) {
      CombatProvider._instance = new CombatProvider();
    }
    return CombatProvider._instance;
  }

  public load(manifest: CombatManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): CombatManifest {
    const parsed = CombatManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: CombatManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): CombatManifest | null {
    return this._manifest;
  }
}

export { CombatProvider };
export const combatProvider = CombatProvider.getInstance();
