/**
 * TreesProvider
 *
 * Singleton persistence layer for the authored trees manifest —
 * tree-type catalog keyed by subtype (`oak`, `maple`, …) consumed by
 * woodcutting skill + procgen vegetation placement.
 *
 * Baseline fixture is `{"$schema":"hyperforge.trees.v1","trees":{}}` —
 * empty tree catalog is schema-valid. Runtime falls back to legacy
 * hardcoded TreeTypes when provider is unloaded or trees are absent.
 */

import {
  TreeManifestSchema,
  type TreeManifest,
} from "@hyperforge/manifest-schema";

class TreesProvider {
  private static _instance: TreesProvider | null = null;
  private _manifest: TreeManifest | null = null;

  public static getInstance(): TreesProvider {
    if (!TreesProvider._instance) {
      TreesProvider._instance = new TreesProvider();
    }
    return TreesProvider._instance;
  }

  public load(manifest: TreeManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): TreeManifest {
    const parsed = TreeManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: TreeManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): TreeManifest | null {
    return this._manifest;
  }
}

export { TreesProvider };
export const treesProvider = TreesProvider.getInstance();
