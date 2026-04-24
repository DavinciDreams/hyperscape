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

export class WorldStructureRegistry {
  private _manifest: WorldStructureManifest | null = null;

  constructor(manifest?: WorldStructureManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: WorldStructureManifest): void {
    this._manifest = manifest;
  }

  loadFromJson(raw: unknown): void {
    this.load(WorldStructureManifestSchema.parse(raw));
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
