/**
 * LoadingScreensProvider
 *
 * Singleton persistence layer for the authored loading-screens
 * manifest — 6-trigger loading-slate registry with weighted
 * selection, fade rules, tip/progress-bar toggles.
 *
 * Refinements: unique slate ids + defaultSlateId resolves or
 * empty + enabled=true requires ≥1 slate.
 *
 * Baseline `{"enabled": false}` keeps the pipeline inert until
 * slates are authored.
 *
 * Runtime LoadingScreensSystem not yet shipped.
 */

import {
  LoadingScreensManifestSchema,
  type LoadingScreensManifest,
} from "@hyperforge/manifest-schema";

class LoadingScreensProvider {
  private static _instance: LoadingScreensProvider | null = null;
  private _manifest: LoadingScreensManifest | null = null;

  public static getInstance(): LoadingScreensProvider {
    if (!LoadingScreensProvider._instance) {
      LoadingScreensProvider._instance = new LoadingScreensProvider();
    }
    return LoadingScreensProvider._instance;
  }

  public load(manifest: LoadingScreensManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): LoadingScreensManifest {
    const parsed = LoadingScreensManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: LoadingScreensManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): LoadingScreensManifest | null {
    return this._manifest;
  }
}

export { LoadingScreensProvider };
export const loadingScreensProvider = LoadingScreensProvider.getInstance();
