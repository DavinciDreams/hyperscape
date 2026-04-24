/**
 * GroupFinderProvider
 *
 * Singleton persistence layer for the authored group-finder /
 * LFG / dungeon-finder manifest — content registry (7-kind
 * dungeon/raid/scenario/battleground/arena/worldBoss/custom)
 * with min/max group size + 5-role requirements (tank/healer/
 * dps/support/flex) + 4-policy queue (random/specific/ranked/
 * casual) + level/gear gates + minRating (ranked-only),
 * matchmaking rules (queueTimeout/readyCheck/backfill/
 * deserter/widening/crossRealm/crossFaction), and rewards
 * (daily/weekly completion bonuses + consolation + role
 * incentive).
 *
 * Refinements: min≤max group size, role-count sum ≤
 * maxGroupSize, minRating>0 requires ranked policy, unique
 * content ids, enabled=true requires ≥1 content entry.
 *
 * A `{enabled: false}` baseline keeps the pipeline inert
 * until content is authored. Runtime GroupFinderSystem not
 * yet shipped.
 */

import {
  GroupFinderManifestSchema,
  type GroupFinderManifest,
} from "@hyperforge/manifest-schema";

class GroupFinderProvider {
  private static _instance: GroupFinderProvider | null = null;
  private _manifest: GroupFinderManifest | null = null;

  public static getInstance(): GroupFinderProvider {
    if (!GroupFinderProvider._instance) {
      GroupFinderProvider._instance = new GroupFinderProvider();
    }
    return GroupFinderProvider._instance;
  }

  public load(manifest: GroupFinderManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): GroupFinderManifest {
    const parsed = GroupFinderManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: GroupFinderManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): GroupFinderManifest | null {
    return this._manifest;
  }
}

export { GroupFinderProvider };
export const groupFinderProvider = GroupFinderProvider.getInstance();
