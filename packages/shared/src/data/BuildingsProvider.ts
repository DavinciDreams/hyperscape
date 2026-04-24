/**
 * BuildingsProvider
 *
 * Singleton persistence layer for the authored buildings manifest —
 * flat array of building entries consumed by procgen town placement.
 *
 * Baseline fixture is `[]` — no authored buildings. The schema is a
 * permissive `passthrough()` shape that only requires `id` so future
 * procgen changes can extend entries without a schema bump.
 *
 * Runtime procgen already reads `buildings.json` via legacy loader;
 * this provider adds the symmetric editor-save path.
 */

import {
  BuildingsManifestSchema,
  type BuildingsManifest,
} from "@hyperforge/manifest-schema";

class BuildingsProvider {
  private static _instance: BuildingsProvider | null = null;
  private _manifest: BuildingsManifest | null = null;

  public static getInstance(): BuildingsProvider {
    if (!BuildingsProvider._instance) {
      BuildingsProvider._instance = new BuildingsProvider();
    }
    return BuildingsProvider._instance;
  }

  public load(manifest: BuildingsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): BuildingsManifest {
    const parsed = BuildingsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: BuildingsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): BuildingsManifest | null {
    return this._manifest;
  }
}

export { BuildingsProvider };
export const buildingsProvider = BuildingsProvider.getInstance();
