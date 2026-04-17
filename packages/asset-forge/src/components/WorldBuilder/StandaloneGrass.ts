/**
 * StandaloneGrass — Thin adapter around shared StandaloneGrass
 *
 * Imports directly from shared SOURCE (not the pre-built bundle) so Vite
 * serves the latest code without stale pre-bundle cache issues.
 */

// Import from SOURCE files — Vite transforms these directly, bypassing
// the pre-built framework.client.js bundle and its stale dep cache.
import {
  StandaloneGrass as SharedStandaloneGrass,
  type GrassTerrainSampler,
  type StandaloneGrassOptions as SharedOptions,
} from "../../../../shared/src/systems/shared/world/StandaloneGrass";
import { TERRAIN_CONSTANTS } from "../../../../shared/src/constants/GameConstants";
import type * as THREE from "three";

// Re-export the shared options type for callers that want game-accurate control
export type { SharedOptions as GameGrassOptions };
export type { GrassTerrainSampler };

/** Legacy editor options — mapped to shared StandaloneGrass internally */
export interface StandaloneGrassOptions {
  /** Ignored (shared uses game-accurate 350 blades/side) */
  density?: number;
  /** Maps to tileSize (default 60) */
  patchSize?: number;
  /** Water level Y — grass culled below this + 1m (default WATER_THRESHOLD) */
  waterLevel?: number;
  /** Ignored (shared handles recentering internally) */
  recenterDistance?: number;
}

/**
 * StandaloneGrass for World Studio.
 * Delegates to @hyperforge/shared's game-accurate implementation.
 */
export class StandaloneGrass {
  private inner: SharedStandaloneGrass;

  constructor(scene: THREE.Scene, options?: StandaloneGrassOptions) {
    console.log(
      "[StandaloneGrass] Creating with GrassMaterialCore (source import)",
    );
    this.inner = new SharedStandaloneGrass(scene, {
      tileSize: options?.patchSize ?? 60,
      waterLevel: options?.waterLevel ?? TERRAIN_CONSTANTS.WATER_THRESHOLD,
    });
  }

  /**
   * Initialize grass rendering.
   * @param sampler Either a GrassTerrainSampler (x,z) → { height, grassWeight }
   *   for patchy placement, or a legacy height-only sampler (x,z) → number.
   */
  async init(
    sampler?: GrassTerrainSampler | ((x: number, z: number) => number),
  ): Promise<void> {
    return this.inner.init(sampler);
  }

  update(dt: number, cameraPos: THREE.Vector3): void {
    this.inner.update(dt, cameraPos);
  }

  setDayIntensity(intensity: number): void {
    this.inner.setDayIntensity(intensity);
  }

  setVisible(visible: boolean): void {
    this.inner.setVisible(visible);
  }

  dispose(): void {
    this.inner.dispose();
  }
}
