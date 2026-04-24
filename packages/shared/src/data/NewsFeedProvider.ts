/**
 * NewsFeedProvider
 *
 * Singleton persistence layer for the authored news-feed
 * manifest — categorized announcement registry (patch notes,
 * maintenance windows, event teasers, hotfixes) with
 * platform / region / build / level / account-age / flag-gate
 * targeting, priority band (critical/high/normal/low),
 * publish+expire ISO windows, pinned/dismissable/trackReads/
 * showUnreadBadge toggles, bodyAssetRef pointers (text/HTML
 * kept out of the manifest for commit friendliness), and
 * feed-level poll/cache/auto-show rules.
 *
 * Schema enforces `enabled=true requires ≥1 category` so a
 * `{enabled: false}` baseline keeps the pipeline inert until
 * live-ops authors content. Runtime NewsFeedSystem not yet
 * shipped.
 */

import {
  NewsFeedManifestSchema,
  type NewsFeedManifest,
} from "@hyperforge/manifest-schema";

class NewsFeedProvider {
  private static _instance: NewsFeedProvider | null = null;
  private _manifest: NewsFeedManifest | null = null;

  public static getInstance(): NewsFeedProvider {
    if (!NewsFeedProvider._instance) {
      NewsFeedProvider._instance = new NewsFeedProvider();
    }
    return NewsFeedProvider._instance;
  }

  public load(manifest: NewsFeedManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): NewsFeedManifest {
    const parsed = NewsFeedManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: NewsFeedManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): NewsFeedManifest | null {
    return this._manifest;
  }
}

export { NewsFeedProvider };
export const newsFeedProvider = NewsFeedProvider.getInstance();
