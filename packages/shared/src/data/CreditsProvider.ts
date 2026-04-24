/**
 * CreditsProvider
 *
 * Singleton persistence layer for the authored credits manifest —
 * credit-roll structure with 7-entry-kind discriminated union
 * (role/person/logo/divider/link/image/localized-text).
 *
 * Baseline fixture is `{"enabled": false}` — default `enabled=true`
 * triggers a refinement that requires ≥1 section. Disabling keeps
 * the provider loaded with an inert config.
 *
 * Runtime credits scroller not yet shipped.
 */

import {
  CreditsManifestSchema,
  type CreditsManifest,
} from "@hyperforge/manifest-schema";

class CreditsProvider {
  private static _instance: CreditsProvider | null = null;
  private _manifest: CreditsManifest | null = null;

  public static getInstance(): CreditsProvider {
    if (!CreditsProvider._instance) {
      CreditsProvider._instance = new CreditsProvider();
    }
    return CreditsProvider._instance;
  }

  public load(manifest: CreditsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): CreditsManifest {
    const parsed = CreditsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: CreditsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): CreditsManifest | null {
    return this._manifest;
  }
}

export { CreditsProvider };
export const creditsProvider = CreditsProvider.getInstance();
