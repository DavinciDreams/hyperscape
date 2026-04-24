/**
 * LoadoutsProvider
 *
 * Singleton persistence layer for the authored loadouts manifest
 * — WoW Equipment Manager-style saved character configurations
 * with maxSlotsPerCharacter (0..50) + freeSlotCount (premium
 * unlock split), 4 rule groups: slot (6-category subset
 * equipment/consumables/abilities/prayers/talents/runes +
 * fullReplacement + pullFromBags/Bank), naming (name-length +
 * profanity-filter + icon-presets), swap (always/outOfCombat/
 * safeZoneOnly policy + cooldown + channel-time with
 * cancelChannelOnDamage-requires-channel refinement +
 * autoRestoreOnRespawn), sharing (export/import/partyShare
 * with partyShare-requires-both refinement).
 *
 * Manifest-level refinements enforce freeSlotCount≤maxSlots
 * and enabled=true requires maxSlotsPerCharacter>0.
 *
 * Runtime LoadoutSystem not yet shipped.
 */

import {
  LoadoutsManifestSchema,
  type LoadoutsManifest,
} from "@hyperforge/manifest-schema";

class LoadoutsProvider {
  private static _instance: LoadoutsProvider | null = null;
  private _manifest: LoadoutsManifest | null = null;

  public static getInstance(): LoadoutsProvider {
    if (!LoadoutsProvider._instance) {
      LoadoutsProvider._instance = new LoadoutsProvider();
    }
    return LoadoutsProvider._instance;
  }

  public load(manifest: LoadoutsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): LoadoutsManifest {
    const parsed = LoadoutsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: LoadoutsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): LoadoutsManifest | null {
    return this._manifest;
  }
}

export { LoadoutsProvider };
export const loadoutsProvider = LoadoutsProvider.getInstance();
