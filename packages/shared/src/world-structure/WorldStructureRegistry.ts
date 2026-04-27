/**
 * World structure registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `world-structure.ts`.
 * Surfaces global grid/terrain/zone sizing constants (grid size, spawn height,
 * water level, max build height, safe-zone radius) behind typed accessors.
 */

import {
  type WorldStructureConstants,
  WorldStructureManifestSchema,
  type WorldStructureManifest,
} from "@hyperforge/manifest-schema";

export class WorldStructureNotLoadedError extends Error {
  constructor() {
    super("WorldStructureRegistry used before load()");
    this.name = "WorldStructureNotLoadedError";
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type WorldStructureReloadListener = () => void;

export class WorldStructureRegistry {
  private _manifest: WorldStructureManifest | null = null;
  private _reloadListeners = new Set<WorldStructureReloadListener>();

  constructor(manifest?: WorldStructureManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: WorldStructureManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(WorldStructureManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: WorldStructureReloadListener): () => void {
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
          "[worldStructureRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): WorldStructureManifest {
    if (!this._manifest) throw new WorldStructureNotLoadedError();
    return this._manifest;
  }

  get constants(): WorldStructureConstants {
    return this.manifest.constants;
  }

  get gridSize(): number {
    return this.constants.gridSize;
  }

  get defaultSpawnHeight(): number {
    return this.constants.defaultSpawnHeight;
  }

  get waterLevel(): number {
    return this.constants.waterLevel;
  }

  get maxBuildHeight(): number {
    return this.constants.maxBuildHeight;
  }

  get safeZoneRadius(): number {
    return this.constants.safeZoneRadius;
  }

  /** Whether a world-space Y coordinate is below the water level. */
  isUnderwater(y: number): boolean {
    return y < this.waterLevel;
  }

  /** Whether `[x, z]` is within `safeZoneRadius` of a town center. */
  isInSafeZone(
    x: number,
    z: number,
    townCenter: { x: number; z: number },
  ): boolean {
    const dx = x - townCenter.x;
    const dz = z - townCenter.z;
    return Math.sqrt(dx * dx + dz * dz) <= this.safeZoneRadius;
  }
}
