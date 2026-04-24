/**
 * TooltipsProvider
 *
 * Singleton persistence layer for the authored tooltips
 * manifest — UI tooltip registry (body-key required, 4-trigger
 * × 5-placement, per-entry show/hide delays, max-width cap,
 * optional icon asset, category tag, max-shows-per-player
 * quota).
 *
 * Refinement: unique entry ids.
 *
 * Baseline `{"enabled": false}` keeps the pipeline inert until
 * tooltip entries are authored.
 *
 * Runtime TooltipsSystem not yet shipped.
 */

import {
  TooltipsManifestSchema,
  type TooltipsManifest,
} from "@hyperforge/manifest-schema";

class TooltipsProvider {
  private static _instance: TooltipsProvider | null = null;
  private _manifest: TooltipsManifest | null = null;

  public static getInstance(): TooltipsProvider {
    if (!TooltipsProvider._instance) {
      TooltipsProvider._instance = new TooltipsProvider();
    }
    return TooltipsProvider._instance;
  }

  public load(manifest: TooltipsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): TooltipsManifest {
    const parsed = TooltipsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: TooltipsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): TooltipsManifest | null {
    return this._manifest;
  }
}

export { TooltipsProvider };
export const tooltipsProvider = TooltipsProvider.getInstance();
