/**
 * MountsProvider
 *
 * Singleton persistence layer for the authored mounts manifest —
 * ground/water/flight locomotion modes with per-mode speed, stamina
 * model, passenger/cargo capacity, summon rules. Runtime
 * MountSystem is not yet shipped — this provider only persists
 * authored data for future consumption.
 *
 * Array-shaped manifest with safe empty semantics: `getMounts()`
 * returns `[]` when unloaded.
 */

import {
  MountsManifestSchema,
  type MountsManifest,
} from "@hyperforge/manifest-schema";

class MountsProvider {
  private static _instance: MountsProvider | null = null;
  private _manifest: MountsManifest | null = null;

  public static getInstance(): MountsProvider {
    if (!MountsProvider._instance) {
      MountsProvider._instance = new MountsProvider();
    }
    return MountsProvider._instance;
  }

  public load(manifest: MountsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): MountsManifest {
    const parsed = MountsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: MountsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getMounts(): MountsManifest {
    return this._manifest ?? [];
  }

  public getManifest(): MountsManifest | null {
    return this._manifest;
  }
}

export { MountsProvider };
export const mountsProvider = MountsProvider.getInstance();
