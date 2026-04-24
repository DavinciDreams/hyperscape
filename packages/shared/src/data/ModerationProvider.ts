/**
 * ModerationProvider
 *
 * Singleton persistence layer for the authored moderation
 * manifest — report-category registry (with 8-default-action
 * enum), chat filter-rule registry (4-match-kind, 5-action)
 * pointing at external pattern assets (slur lists NOT in
 * manifest — keeps committed JSON family safe), per-category
 * sanction ladders (7-tier action enum + strictly-increasing
 * atOffenseCount + duration=0-as-permanent-for-ban-only
 * refinement), and global rule blocks (reportRateLimits,
 * autoModeration, appeals, banPolicy).
 *
 * Schema enforces unique category/filter/ladder ids +
 * at-most-one-ladder-per-category + ladder.categoryId
 * resolves + enabled=true requires ≥1 reportCategory. A
 * `{enabled: false}` baseline keeps the pipeline inert.
 * Runtime ModerationSystem not yet shipped.
 */

import {
  ModerationManifestSchema,
  type ModerationManifest,
} from "@hyperforge/manifest-schema";

class ModerationProvider {
  private static _instance: ModerationProvider | null = null;
  private _manifest: ModerationManifest | null = null;

  public static getInstance(): ModerationProvider {
    if (!ModerationProvider._instance) {
      ModerationProvider._instance = new ModerationProvider();
    }
    return ModerationProvider._instance;
  }

  public load(manifest: ModerationManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): ModerationManifest {
    const parsed = ModerationManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: ModerationManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ModerationManifest | null {
    return this._manifest;
  }
}

export { ModerationProvider };
export const moderationProvider = ModerationProvider.getInstance();
