/**
 * StandaloneGrass — Thin lifecycle wrapper around GrassMaterialCore
 *
 * Uses the SAME shader as the game's ProceduralGrass LOD0 (via GrassMaterialCore).
 * Manages heightmap texture, sampler callbacks, and per-frame uniform updates.
 *
 * The editor adapter in asset-forge wraps this class and maps legacy options.
 *
 * @module StandaloneGrass
 */

import THREE from "../../../extras/three/three";
import { TERRAIN_CONSTANTS } from "../../../constants/GameConstants";
import { generateNoiseTexture } from "./TerrainShader";
import {
  createGrassLod0Geometry,
  createGrassLod0Material,
  createGrassLod0Uniforms,
  GRASS_LOD0_DEFAULTS,
  type GrassLod0Uniforms,
} from "./GrassMaterialCore";

// ============================================================================
// OPTIONS
// ============================================================================

const HEIGHTMAP_SIZE = 64;
const HEIGHTMAP_MAX = 120;
const RECENTER_THRESHOLD = 8;

/** Result from terrain sampler — height + grass density + biome weights */
export interface GrassTerrainSample {
  height: number;
  /** 0 = no grass (cliff/sand/shoreline), 1 = full grass. Drives stochastic culling. */
  grassWeight: number;
  /** Forest biome weight 0-1 (default 0) */
  forestWeight?: number;
  /** Canyon/desert biome weight 0-1 (default 0) */
  canyonWeight?: number;
}

/** Terrain sampler: worldX, worldZ → height + grassWeight + biome */
export type GrassTerrainSampler = (x: number, z: number) => GrassTerrainSample;

export interface StandaloneGrassOptions {
  tileSize?: number;
  bladesPerSide?: number;
  bladeWidth?: number;
  bladeHeight?: number;
  waterLevel?: number;
}

// ============================================================================
// CLASS
// ============================================================================

export class StandaloneGrass {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh | null = null;
  private terrainSampler: GrassTerrainSampler | null = null;

  private tileSize: number;
  private bladesPerSide: number;

  // Shared uniforms from GrassMaterialCore
  private uniforms: GrassLod0Uniforms;

  // Textures
  private heightmapTexture: THREE.DataTexture | null = null;
  private noiseTexture: THREE.DataTexture | null = null;

  // Tracking for heightmap recentering
  private lastCenterX = NaN;
  private lastCenterZ = NaN;
  private recenterDistSq = RECENTER_THRESHOLD * RECENTER_THRESHOLD;

  constructor(scene: THREE.Scene, options?: StandaloneGrassOptions) {
    this.scene = scene;
    this.tileSize = options?.tileSize ?? GRASS_LOD0_DEFAULTS.tileSize;
    this.bladesPerSide =
      options?.bladesPerSide ?? GRASS_LOD0_DEFAULTS.bladesPerSide;

    // Create uniforms from the shared core — same defaults as ProceduralGrass
    this.uniforms = createGrassLod0Uniforms({
      tileSize: this.tileSize,
      bladesPerSide: this.bladesPerSide,
      bladeWidth: options?.bladeWidth ?? GRASS_LOD0_DEFAULTS.bladeWidth,
      bladeHeight: options?.bladeHeight ?? GRASS_LOD0_DEFAULTS.bladeHeight,
    });

    // Override water level if provided
    const wl = options?.waterLevel ?? TERRAIN_CONSTANTS.WATER_THRESHOLD;
    this.uniforms.waterHardCutoff.value = wl + 1.0;
  }

  /**
   * Initialize grass rendering.
   * @param sampler Either a GrassTerrainSampler (x,z) → { height, grassWeight }
   *   for patchy placement, or a legacy height-only sampler (x,z) → number.
   */
  async init(
    sampler?: GrassTerrainSampler | ((x: number, z: number) => number),
  ): Promise<void> {
    if (sampler) {
      const testResult = sampler(0, 0);
      if (typeof testResult === "number") {
        const heightFn = sampler as (x: number, z: number) => number;
        this.terrainSampler = (x, z) => ({
          height: heightFn(x, z),
          grassWeight: 1.0,
        });
      } else {
        this.terrainSampler = sampler as GrassTerrainSampler;
      }
    }

    this.noiseTexture = generateNoiseTexture(12345);
    this.createHeightTexture();

    // Use shared geometry + material from GrassMaterialCore
    const geometry = createGrassLod0Geometry({
      tileSize: this.tileSize,
      bladesPerSide: this.bladesPerSide,
    });
    const material = createGrassLod0Material({
      uniforms: this.uniforms,
      heightmapTexture: this.heightmapTexture,
      noiseTexture: this.noiseTexture,
      grassWeightCulling: false, // Match game LOD0 — no stochastic culling
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.name = "StandaloneGrass";
    this.mesh.renderOrder = 76; // Match game — render AFTER terrain

    this.scene.add(this.mesh);
  }

  update(_dt: number, cameraPos: THREE.Vector3): void {
    if (!this.mesh) return;
    this.uniforms.cameraPosition.value.copy(cameraPos);
    this.uniforms.playerCenter.value.set(cameraPos.x, cameraPos.z);

    const dx = cameraPos.x - this.lastCenterX;
    const dz = cameraPos.z - this.lastCenterZ;
    if (
      Number.isNaN(this.lastCenterX) ||
      dx * dx + dz * dz > this.recenterDistSq
    ) {
      this.updateHeightTexture(cameraPos.x, cameraPos.z);
    }
  }

  setDayIntensity(intensity: number): void {
    this.uniforms.dayNightMix.value = intensity;
  }

  setVisible(visible: boolean): void {
    if (this.mesh) this.mesh.visible = visible;
  }

  dispose(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      if (this.mesh.material instanceof THREE.Material) {
        this.mesh.material.dispose();
      }
      this.mesh = null;
    }
    if (this.heightmapTexture) {
      this.heightmapTexture.dispose();
      this.heightmapTexture = null;
    }
    this.noiseTexture = null;
    this.terrainSampler = null;
  }

  // ============================================================================
  // PRIVATE — Heightmap
  // ============================================================================

  private createHeightTexture(): void {
    const size = HEIGHTMAP_SIZE;
    const data = new Float32Array(size * size * 4);
    this.heightmapTexture = new THREE.DataTexture(
      data,
      size,
      size,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this.heightmapTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.heightmapTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.heightmapTexture.magFilter = THREE.LinearFilter;
    this.heightmapTexture.minFilter = THREE.LinearFilter;
    this.heightmapTexture.needsUpdate = true;
  }

  /**
   * R = normalized height, G = grassWeight, B = forestWeight, A = canyonWeight
   */
  private updateHeightTexture(cx: number, cz: number): void {
    if (!this.heightmapTexture || !this.terrainSampler) {
      this.lastCenterX = cx;
      this.lastCenterZ = cz;
      return;
    }

    const size = HEIGHTMAP_SIZE;
    const data = this.heightmapTexture.image.data as Float32Array;
    const worldSize = this.tileSize;
    const halfSize = worldSize * 0.5;
    const maxH = HEIGHTMAP_MAX;
    const pixelSize = worldSize / size;

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const wx = cx - halfSize + (col + 0.5) * pixelSize;
        const wz = cz - halfSize + (row + 0.5) * pixelSize;
        const s = this.terrainSampler(wx, wz);
        const idx = (row * size + col) * 4;
        data[idx] = Math.max(0, s.height) / maxH;
        data[idx + 1] = Math.max(0, Math.min(1, s.grassWeight));
        data[idx + 2] = Math.max(0, Math.min(1, s.forestWeight ?? 0));
        data[idx + 3] = Math.max(0, Math.min(1, s.canyonWeight ?? 0));
      }
    }

    this.heightmapTexture.needsUpdate = true;
    this.uniforms.heightmapCenterX.value = cx;
    this.uniforms.heightmapCenterZ.value = cz;
    this.lastCenterX = cx;
    this.lastCenterZ = cz;
  }
}
