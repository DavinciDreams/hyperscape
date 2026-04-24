/**
 * PrefabProvider
 *
 * Singleton persistence layer for the authored prefab manifest —
 * reusable entity composition with slash-separated lowerCamelCase
 * localIds, sparse overrides targeting (localId, propertyName)
 * pairs, nested-prefab DAG with DFS cycle detection, plus
 * placed prefab instances.
 *
 * Refinements: unique prefab ids + unique instance ids + every
 * instance `prefabId` resolves to a declared prefab + no cycles in
 * nested prefab graph.
 *
 * Baseline fixture is `{}` — empty prefabs/instances arrays.
 *
 * Runtime instantiator pending.
 */

import {
  PrefabManifestSchema,
  type PrefabManifest,
} from "@hyperforge/manifest-schema";

class PrefabProvider {
  private static _instance: PrefabProvider | null = null;
  private _manifest: PrefabManifest | null = null;

  public static getInstance(): PrefabProvider {
    if (!PrefabProvider._instance) {
      PrefabProvider._instance = new PrefabProvider();
    }
    return PrefabProvider._instance;
  }

  public load(manifest: PrefabManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): PrefabManifest {
    const parsed = PrefabManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: PrefabManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): PrefabManifest | null {
    return this._manifest;
  }
}

export { PrefabProvider };
export const prefabProvider = PrefabProvider.getInstance();
