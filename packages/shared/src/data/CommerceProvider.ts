/**
 * CommerceProvider
 *
 * Singleton persistence layer for the authored commerce manifest —
 * global commerce constants (buyback rate, unlimited-stock sentinels,
 * interaction range, starter store inventory).
 *
 * No safe baseline — schema requires `$schema` + several scalar
 * fields + `starterStoreItemIds.min(1)`. Runtime falls back to
 * legacy hardcoded commerce constants when provider is unloaded.
 */

import {
  CommerceManifestSchema,
  type CommerceManifest,
} from "@hyperforge/manifest-schema";

class CommerceProvider {
  private static _instance: CommerceProvider | null = null;
  private _manifest: CommerceManifest | null = null;

  public static getInstance(): CommerceProvider {
    if (!CommerceProvider._instance) {
      CommerceProvider._instance = new CommerceProvider();
    }
    return CommerceProvider._instance;
  }

  public load(manifest: CommerceManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): CommerceManifest {
    const parsed = CommerceManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: CommerceManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): CommerceManifest | null {
    return this._manifest;
  }
}

export { CommerceProvider };
export const commerceProvider = CommerceProvider.getInstance();
