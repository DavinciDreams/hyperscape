/**
 * SeasonsProvider
 *
 * Singleton persistence layer for the authored seasons manifest
 * — Battle Pass / live-ops progression registry with free|
 * premium|bonus tracks, tier 1..200 with author-listed xpRequired
 * + item/currency/cosmetic rewards (rewardCount>0 requires item
 * OR currency refinement), daily/weekly/season challenges with
 * premiumOnly flag + unlockWeek, ISO 8601 startsAt/endsAt with
 * strict `<` refinement, ≥1-free-track refinement, premiumPrice>0-
 * requires-premium-track refinement, end-of-season rules (mail
 * unclaimed/reset XP/grace days/snapshot leaderboard).
 *
 * Manifest-level refinement enforces unique season ids + non-
 * overlapping time windows (adjacency allowed).
 *
 * Array-shape manifest — empty `[]` baseline keeps the
 * pipeline inert until seasons are authored.
 *
 * Runtime SeasonSystem not yet shipped.
 */

import {
  SeasonsManifestSchema,
  type SeasonsManifest,
} from "@hyperforge/manifest-schema";

class SeasonsProvider {
  private static _instance: SeasonsProvider | null = null;
  private _manifest: SeasonsManifest | null = null;

  public static getInstance(): SeasonsProvider {
    if (!SeasonsProvider._instance) {
      SeasonsProvider._instance = new SeasonsProvider();
    }
    return SeasonsProvider._instance;
  }

  public load(manifest: SeasonsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): SeasonsManifest {
    const parsed = SeasonsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: SeasonsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): SeasonsManifest | null {
    return this._manifest;
  }
}

export { SeasonsProvider };
export const seasonsProvider = SeasonsProvider.getInstance();
