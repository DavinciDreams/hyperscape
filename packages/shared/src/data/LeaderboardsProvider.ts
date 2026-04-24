/**
 * LeaderboardsProvider
 *
 * Singleton persistence layer for the authored leaderboards
 * manifest — registry of leaderboard definitions (10-metric
 * pvpRating/dungeonClearTime/bossKillCount/goldEarned/xpEarned/
 * craftingScore/gatheringScore/fishSize/achievementScore/custom)
 * with 5-scope (global/region/guild/faction/friends), 5-cadence
 * (allTime/season/monthly/weekly/daily), 3-tieBreak (earliestFirst/
 * latestFirst/none), desc/asc sort, rank|percent reward brackets
 * with mode-scoped non-overlap refinements, rollover-announcement
 * opts.
 *
 * Array-shape manifest — empty `[]` baseline keeps the
 * pipeline inert until boards are authored.
 *
 * Runtime LeaderboardSystem not yet shipped.
 */

import {
  LeaderboardsManifestSchema,
  type LeaderboardsManifest,
} from "@hyperforge/manifest-schema";

class LeaderboardsProvider {
  private static _instance: LeaderboardsProvider | null = null;
  private _manifest: LeaderboardsManifest | null = null;

  public static getInstance(): LeaderboardsProvider {
    if (!LeaderboardsProvider._instance) {
      LeaderboardsProvider._instance = new LeaderboardsProvider();
    }
    return LeaderboardsProvider._instance;
  }

  public load(manifest: LeaderboardsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): LeaderboardsManifest {
    const parsed = LeaderboardsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: LeaderboardsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): LeaderboardsManifest | null {
    return this._manifest;
  }
}

export { LeaderboardsProvider };
export const leaderboardsProvider = LeaderboardsProvider.getInstance();
