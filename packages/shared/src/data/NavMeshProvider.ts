/**
 * NavMeshProvider
 *
 * Singleton persistence layer for the authored nav-mesh manifest —
 * voxelizer settings + agent profiles (radius/height/step/slope) +
 * modifier volumes with block/unwalkable/cost-multiply/area-override
 * effects + jump links with agent/area-tag filtering.
 *
 * No baseline fixture — `agents.min(1)` is mandatory, so `{}` fails
 * schema. Absence leaves the provider unloaded → runtime pathfinder
 * must rely on its own defaults.
 *
 * Runtime NavMeshPathfinder not yet shipped.
 */

import {
  NavMeshManifestSchema,
  type NavMeshManifest,
} from "@hyperforge/manifest-schema";

class NavMeshProvider {
  private static _instance: NavMeshProvider | null = null;
  private _manifest: NavMeshManifest | null = null;

  public static getInstance(): NavMeshProvider {
    if (!NavMeshProvider._instance) {
      NavMeshProvider._instance = new NavMeshProvider();
    }
    return NavMeshProvider._instance;
  }

  public load(manifest: NavMeshManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): NavMeshManifest {
    const parsed = NavMeshManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: NavMeshManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): NavMeshManifest | null {
    return this._manifest;
  }
}

export { NavMeshProvider };
export const navMeshProvider = NavMeshProvider.getInstance();
