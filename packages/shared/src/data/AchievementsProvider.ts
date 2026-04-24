/**
 * AchievementsProvider
 *
 * Singleton persistence layer for the authored achievements manifest.
 * Follows the same pattern as `CombatTuningProvider` / `LootTablesProvider`:
 * validates raw JSON through `AchievementsManifestSchema`, stores the
 * result, and exposes a safe `[]` default when unloaded so consumers
 * (typically an `AchievementEvaluator`) can iterate unconditionally.
 *
 * Kept separate from `AchievementEvaluator` so (a) validation happens
 * at the edge, (b) the provider stays dependency-free, and (c) the
 * evaluator can be instantiated per-world with mutable
 * `AchievementProgressState` without fighting the singleton.
 */

import {
  AchievementsManifestSchema,
  type AchievementsManifest,
} from "@hyperforge/manifest-schema";

class AchievementsProvider {
  private static _instance: AchievementsProvider | null = null;
  private _manifest: AchievementsManifest | null = null;

  public static getInstance(): AchievementsProvider {
    if (!AchievementsProvider._instance) {
      AchievementsProvider._instance = new AchievementsProvider();
    }
    return AchievementsProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: AchievementsManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): AchievementsManifest {
    const parsed = AchievementsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: AchievementsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Current authored achievements. Empty array when not loaded — safe
   * to iterate unconditionally.
   */
  public getAchievements(): AchievementsManifest {
    return this._manifest ?? [];
  }

  /** Raw manifest reference (null when not loaded). Mainly for tests. */
  public getManifest(): AchievementsManifest | null {
    return this._manifest;
  }
}

export { AchievementsProvider };
export const achievementsProvider = AchievementsProvider.getInstance();
