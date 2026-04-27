/**
 * Buildings registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `buildings.ts`.
 * Indexes the procgen building catalog by id. The upstream schema
 * currently accepts arbitrary fields via passthrough, so the registry
 * preserves the raw entry shape.
 */

import {
  type Building,
  type BuildingsManifest,
  BuildingsManifestSchema,
} from "@hyperforge/manifest-schema";

export class BuildingsNotLoadedError extends Error {
  constructor() {
    super("BuildingsRegistry used before load()");
    this.name = "BuildingsNotLoadedError";
  }
}

export class UnknownBuildingError extends Error {
  readonly buildingId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `building "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownBuildingError";
    this.buildingId = id;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type BuildingsReloadListener = () => void;

export class BuildingsRegistry {
  private _manifest: BuildingsManifest | null = null;
  private _byId = new Map<string, Building>();
  private _reloadListeners = new Set<BuildingsReloadListener>();

  constructor(manifest?: BuildingsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: BuildingsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const b of manifest) this._byId.set(b.id, b);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(BuildingsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: BuildingsReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[buildingsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): BuildingsManifest {
    if (!this._manifest) throw new BuildingsNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): Building {
    const b = this._byId.get(id);
    if (!b) throw new UnknownBuildingError(id, this.ids);
    return b;
  }

  all(): readonly Building[] {
    return this.manifest;
  }
}
