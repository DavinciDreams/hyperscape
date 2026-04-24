/**
 * RespawnProvider
 *
 * Singleton persistence layer for the authored respawn
 * manifest — bind-point registry (7-kind graveyard /
 * innkeeper / capitalSpawn / dungeonEntrance /
 * raidEntrance / playerHousing / custom) with per-point
 * allowBindHere / corpseRunAllowed / applyResurrectionSickness
 * toggles and level/faction gates, plus three global rule
 * blocks — DeathPenalty (xpLoss / delevel / goldLoss /
 * durability / drop policy with grace window), CorpseRun
 * (ghost speed, invisibility, invuln, despawn, PvP full-loot,
 * proximity-rez, corpse-teleport), and Resurrection (rez
 * sickness, stat reduction, auto-res-at-bind, spirit-guide
 * res, sickness min-level).
 *
 * Schema enforces unique bind-point ids + enabled=true
 * requires ≥1 bind point AND ≥1 bind point with
 * allowBindHere=true + custom-kind-requires-customKey on
 * points + pairwise refinements inside each rule block. A
 * `{enabled: false}` baseline keeps the pipeline inert until
 * bind points are authored. Runtime RespawnSystem not yet
 * shipped.
 */

import {
  RespawnManifestSchema,
  type RespawnManifest,
} from "@hyperforge/manifest-schema";

class RespawnProvider {
  private static _instance: RespawnProvider | null = null;
  private _manifest: RespawnManifest | null = null;

  public static getInstance(): RespawnProvider {
    if (!RespawnProvider._instance) {
      RespawnProvider._instance = new RespawnProvider();
    }
    return RespawnProvider._instance;
  }

  public load(manifest: RespawnManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): RespawnManifest {
    const parsed = RespawnManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: RespawnManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): RespawnManifest | null {
    return this._manifest;
  }
}

export { RespawnProvider };
export const respawnProvider = RespawnProvider.getInstance();
