/**
 * StoreFrontProvider
 *
 * Singleton persistence layer for the authored store-front manifest —
 * premium/real-money bundle catalog with shelves, discount rules,
 * price tiers, and global spend caps.
 *
 * Baseline `{}` acceptable — all fields have defaults and the empty
 * arrays satisfy every unique-id refinement trivially. Runtime falls
 * back to a closed store when provider is unloaded (no items sold).
 */

import {
  StoreFrontManifestSchema,
  type StoreFrontManifest,
} from "@hyperforge/manifest-schema";

class StoreFrontProvider {
  private static _instance: StoreFrontProvider | null = null;
  private _manifest: StoreFrontManifest | null = null;

  public static getInstance(): StoreFrontProvider {
    if (!StoreFrontProvider._instance) {
      StoreFrontProvider._instance = new StoreFrontProvider();
    }
    return StoreFrontProvider._instance;
  }

  public load(manifest: StoreFrontManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): StoreFrontManifest {
    const parsed = StoreFrontManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: StoreFrontManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): StoreFrontManifest | null {
    return this._manifest;
  }
}

export { StoreFrontProvider };
export const storeFrontProvider = StoreFrontProvider.getInstance();
