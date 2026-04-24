/**
 * MainMenuProvider
 *
 * Singleton persistence layer for the authored main-menu manifest
 * — pre-game menu tree with 9-action-kind entries, 7-visibility
 * predicates, `openSubmenu` cross-references.
 *
 * Baseline fixture is `{"enabled": false}` — default `enabled=true`
 * triggers a refinement that requires ≥1 menu + rootMenuId, so `{}`
 * would fail. Disabling keeps the provider loaded with an inert
 * config.
 *
 * Runtime main-menu React shell not yet wired to this manifest.
 */

import {
  MainMenuManifestSchema,
  type MainMenuManifest,
} from "@hyperforge/manifest-schema";

class MainMenuProvider {
  private static _instance: MainMenuProvider | null = null;
  private _manifest: MainMenuManifest | null = null;

  public static getInstance(): MainMenuProvider {
    if (!MainMenuProvider._instance) {
      MainMenuProvider._instance = new MainMenuProvider();
    }
    return MainMenuProvider._instance;
  }

  public load(manifest: MainMenuManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): MainMenuManifest {
    const parsed = MainMenuManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: MainMenuManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): MainMenuManifest | null {
    return this._manifest;
  }
}

export { MainMenuProvider };
export const mainMenuProvider = MainMenuProvider.getInstance();
