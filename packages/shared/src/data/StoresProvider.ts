/**
 * StoresProvider
 *
 * Singleton persistence layer for the authored stores manifest — array
 * of Store registry entries (shop inventories, store types, item stock)
 * consumed by the shop/vendor runtime.
 *
 * Baseline fixture is `[]` — no authored stores.
 *
 * Runtime store/vendor wiring pending.
 */

import {
  StoresManifestSchema,
  type StoresManifest,
} from "@hyperforge/manifest-schema";

class StoresProvider {
  private static _instance: StoresProvider | null = null;
  private _manifest: StoresManifest | null = null;

  public static getInstance(): StoresProvider {
    if (!StoresProvider._instance) {
      StoresProvider._instance = new StoresProvider();
    }
    return StoresProvider._instance;
  }

  public load(manifest: StoresManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): StoresManifest {
    const parsed = StoresManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: StoresManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): StoresManifest | null {
    return this._manifest;
  }
}

export { StoresProvider };
export const storesProvider = StoresProvider.getInstance();
