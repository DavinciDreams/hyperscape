/**
 * ScreenshotProvider
 *
 * Singleton persistence layer for the authored screenshot
 * manifest — photo-mode capture policy with 3-format (png/
 * jpeg/webp), 7-aspect preset, capture rules, photo-mode
 * rules, watermark rules, and a share-target registry with
 * 4-share-kind (deviceGallery/socialShare/httpEndpoint/
 * customEndpoint) backed by endpointNameRef → deploy-target
 * (commit-safe, no real URLs).
 *
 * Refinements: unique share-target ids + enabled=true requires
 * ≥1 enabled share target.
 *
 * Baseline `{"enabled": false}` keeps the pipeline inert until
 * share targets are authored.
 *
 * Runtime ScreenshotSystem not yet shipped.
 */

import {
  ScreenshotManifestSchema,
  type ScreenshotManifest,
} from "@hyperforge/manifest-schema";

class ScreenshotProvider {
  private static _instance: ScreenshotProvider | null = null;
  private _manifest: ScreenshotManifest | null = null;

  public static getInstance(): ScreenshotProvider {
    if (!ScreenshotProvider._instance) {
      ScreenshotProvider._instance = new ScreenshotProvider();
    }
    return ScreenshotProvider._instance;
  }

  public load(manifest: ScreenshotManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): ScreenshotManifest {
    const parsed = ScreenshotManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: ScreenshotManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ScreenshotManifest | null {
    return this._manifest;
  }
}

export { ScreenshotProvider };
export const screenshotProvider = ScreenshotProvider.getInstance();
