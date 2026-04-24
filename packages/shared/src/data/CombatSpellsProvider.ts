/**
 * CombatSpellsProvider
 *
 * Singleton persistence layer for the authored combat-spells manifest —
 * magic spell definitions with rune costs, accuracy, damage, element.
 * Authored at `combat-spells.json`; schema is `CombatSpellsManifestSchema`.
 *
 * No safe baseline — schema requires `standard`. Distinct from the
 * `combat-spells.ts` build-time registry module; this provider is the
 * runtime boot-load anchor for hot reload.
 */

import {
  CombatSpellsManifestSchema,
  type CombatSpellsManifest,
} from "@hyperforge/manifest-schema";

class CombatSpellsProvider {
  private static _instance: CombatSpellsProvider | null = null;
  private _manifest: CombatSpellsManifest | null = null;

  public static getInstance(): CombatSpellsProvider {
    if (!CombatSpellsProvider._instance) {
      CombatSpellsProvider._instance = new CombatSpellsProvider();
    }
    return CombatSpellsProvider._instance;
  }

  public load(manifest: CombatSpellsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): CombatSpellsManifest {
    const parsed = CombatSpellsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: CombatSpellsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): CombatSpellsManifest | null {
    return this._manifest;
  }
}

export { CombatSpellsProvider };
export const combatSpellsProvider = CombatSpellsProvider.getInstance();
