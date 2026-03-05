/**
 * TerrainQuadChunkGenerator — Assembles terrain geometry for quad-tree chunks
 * from pre-computed worker output.
 *
 * The heavy lifting (noise, heights, normals, biome blending) is done by
 * QuadChunkWorker on a background thread. This module handles:
 * - Road influence sampling (needs live road network)
 * - Flat-zone height overrides (needs live building data)
 * - Skirt geometry generation
 * - Index buffer generation
 * - THREE.BufferGeometry assembly
 *
 * CLIENT-ONLY: Server terrain uses the flat tile grid.
 */

import THREE from "../../../extras/three/three";
import type { QuadChunkWorkerOutput } from "../../../utils/workers/QuadChunkWorker";

/**
 * Main-thread callbacks for game-state queries that can't run in a worker.
 */
export interface ChunkTerrainProvider {
  calculateRoadInfluenceAtVertex(
    worldX: number,
    worldZ: number,
    tileX: number,
    tileZ: number,
  ): number;
  getFlatZoneAt(
    worldX: number,
    worldZ: number,
  ): { height: number; blendRadius: number } | null;
  getHeightAtComputed(worldX: number, worldZ: number): number;
  readonly TILE_SIZE: number;
}

export interface ChunkGeometryResult {
  geometry: THREE.BufferGeometry;
  heightData: Float32Array;
}

/**
 * Assemble a THREE.BufferGeometry from worker-computed height/normal/color/biome
 * data, adding road influence and skirts on the main thread.
 */
export function assembleQuadChunkGeometry(
  workerData: QuadChunkWorkerOutput,
  provider: ChunkTerrainProvider,
  skirtDrop: number,
): ChunkGeometryResult {
  const {
    centerX,
    centerZ,
    size,
    resolution,
    heightData,
    normalData,
    colorData,
    biomeData,
  } = workerData;
  const segments = resolution;
  const halfSize = size * 0.5;
  const gridStep = size / (segments - 1);

  const skirtCount = segments * 4;
  const totalVertices = segments * segments + skirtCount;
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const colors = new Float32Array(totalVertices * 3);
  const biomeIds = new Float32Array(totalVertices);
  const roadInfluences = new Float32Array(totalVertices);

  let flatZoneModified = false;

  for (let iz = 0; iz < segments; iz++) {
    const localZ = -halfSize + iz * gridStep;
    const worldZ = centerZ + localZ;

    for (let ix = 0; ix < segments; ix++) {
      const localX = -halfSize + ix * gridStep;
      const worldX = centerX + localX;
      const idx = iz * segments + ix;
      const i3 = idx * 3;

      let height = heightData[idx];

      const flatZone = provider.getFlatZoneAt(worldX, worldZ);
      if (flatZone) {
        const distFactor = 1.0;
        height = height + (flatZone.height - height) * distFactor;
        flatZoneModified = true;
      }

      positions[i3] = localX;
      positions[i3 + 1] = height;
      positions[i3 + 2] = localZ;

      normals[i3] = normalData[i3];
      normals[i3 + 1] = normalData[i3 + 1];
      normals[i3 + 2] = normalData[i3 + 2];

      colors[i3] = colorData[i3];
      colors[i3 + 1] = colorData[i3 + 1];
      colors[i3 + 2] = colorData[i3 + 2];

      biomeIds[idx] = biomeData[idx];

      const roadTileX = Math.floor(worldX / provider.TILE_SIZE);
      const roadTileZ = Math.floor(worldZ / provider.TILE_SIZE);
      roadInfluences[idx] = provider.calculateRoadInfluenceAtVertex(
        worldX,
        worldZ,
        roadTileX,
        roadTileZ,
      );
    }
  }

  if (flatZoneModified) {
    recomputeNormals(positions, normals, segments, gridStep);
  }

  // =========================================================================
  // Skirt geometry
  // =========================================================================
  let skirtIdx = segments * segments;

  const copyEdgeVertex = (mainIdx: number) => {
    const si3 = skirtIdx * 3;
    const mi3 = mainIdx * 3;
    positions[si3] = positions[mi3];
    positions[si3 + 1] = positions[mi3 + 1] - skirtDrop;
    positions[si3 + 2] = positions[mi3 + 2];
    normals[si3] = normals[mi3];
    normals[si3 + 1] = normals[mi3 + 1];
    normals[si3 + 2] = normals[mi3 + 2];
    colors[si3] = colors[mi3];
    colors[si3 + 1] = colors[mi3 + 1];
    colors[si3 + 2] = colors[mi3 + 2];
    biomeIds[skirtIdx] = biomeIds[mainIdx];
    roadInfluences[skirtIdx] = roadInfluences[mainIdx];
    skirtIdx++;
  };

  for (let ix = 0; ix < segments; ix++) copyEdgeVertex(ix);
  for (let ix = 0; ix < segments; ix++)
    copyEdgeVertex((segments - 1) * segments + ix);
  for (let iz = 0; iz < segments; iz++) copyEdgeVertex(iz * segments);
  for (let iz = 0; iz < segments; iz++)
    copyEdgeVertex(iz * segments + (segments - 1));

  // =========================================================================
  // Indices
  // =========================================================================
  const subs = segments - 1;
  const mainFaceCount = subs * subs;
  const skirtFaceCount = subs * 4;
  const totalIndices = (mainFaceCount + skirtFaceCount) * 6;
  const indices = new Uint32Array(totalIndices);
  let ii = 0;

  for (let iz = 0; iz < subs; iz++) {
    for (let ix = 0; ix < subs; ix++) {
      const a = iz * segments + ix;
      const b = a + 1;
      const c = a + segments;
      const d = c + 1;
      indices[ii++] = a;
      indices[ii++] = c;
      indices[ii++] = b;
      indices[ii++] = b;
      indices[ii++] = c;
      indices[ii++] = d;
    }
  }

  const skirtBase = segments * segments;
  const northSkirtBase = skirtBase;
  const southSkirtBase = skirtBase + segments;
  const westSkirtBase = skirtBase + segments * 2;
  const eastSkirtBase = skirtBase + segments * 3;

  for (let ix = 0; ix < subs; ix++) {
    const mainA = ix;
    const mainB = ix + 1;
    const skirtA = northSkirtBase + ix;
    const skirtB = northSkirtBase + ix + 1;
    indices[ii++] = skirtA;
    indices[ii++] = mainA;
    indices[ii++] = skirtB;
    indices[ii++] = skirtB;
    indices[ii++] = mainA;
    indices[ii++] = mainB;
  }

  for (let ix = 0; ix < subs; ix++) {
    const mainA = (segments - 1) * segments + ix;
    const mainB = mainA + 1;
    const skirtA = southSkirtBase + ix;
    const skirtB = southSkirtBase + ix + 1;
    indices[ii++] = mainA;
    indices[ii++] = skirtA;
    indices[ii++] = mainB;
    indices[ii++] = mainB;
    indices[ii++] = skirtA;
    indices[ii++] = skirtB;
  }

  for (let iz = 0; iz < subs; iz++) {
    const mainA = iz * segments;
    const mainB = (iz + 1) * segments;
    const skirtA = westSkirtBase + iz;
    const skirtB = westSkirtBase + iz + 1;
    indices[ii++] = mainA;
    indices[ii++] = skirtA;
    indices[ii++] = mainB;
    indices[ii++] = mainB;
    indices[ii++] = skirtA;
    indices[ii++] = skirtB;
  }

  for (let iz = 0; iz < subs; iz++) {
    const mainA = iz * segments + (segments - 1);
    const mainB = (iz + 1) * segments + (segments - 1);
    const skirtA = eastSkirtBase + iz;
    const skirtB = eastSkirtBase + iz + 1;
    indices[ii++] = skirtA;
    indices[ii++] = mainA;
    indices[ii++] = skirtB;
    indices[ii++] = skirtB;
    indices[ii++] = mainA;
    indices[ii++] = mainB;
  }

  // =========================================================================
  // Build BufferGeometry
  // =========================================================================
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("biomeId", new THREE.BufferAttribute(biomeIds, 1));
  geometry.setAttribute(
    "roadInfluence",
    new THREE.BufferAttribute(roadInfluences, 1),
  );
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { geometry, heightData };
}

/**
 * Recompute normals for the main grid after flat-zone height overrides.
 * Uses simple centered finite differences from the position buffer.
 */
function recomputeNormals(
  positions: Float32Array,
  normals: Float32Array,
  segments: number,
  gridStep: number,
): void {
  const invTwoStep = 1 / (2 * gridStep);

  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const idx = iz * segments + ix;
      const i3 = idx * 3;

      const izN = Math.max(0, iz - 1);
      const izS = Math.min(segments - 1, iz + 1);
      const ixW = Math.max(0, ix - 1);
      const ixE = Math.min(segments - 1, ix + 1);

      const hL = positions[(iz * segments + ixW) * 3 + 1];
      const hR = positions[(iz * segments + ixE) * 3 + 1];
      const hD = positions[(izN * segments + ix) * 3 + 1];
      const hU = positions[(izS * segments + ix) * 3 + 1];

      const dhdx = (hR - hL) * invTwoStep;
      const dhdz = (hU - hD) * invTwoStep;
      const nx = -dhdx;
      const ny = 1;
      const nz = -dhdz;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      normals[i3] = nx / len;
      normals[i3 + 1] = ny / len;
      normals[i3 + 2] = nz / len;
    }
  }
}

/**
 * Synchronous fallback: generates geometry without a worker.
 * Used when workers are unavailable (server-side or fallback).
 */
export function generateQuadChunkGeometrySync(
  centerX: number,
  centerZ: number,
  size: number,
  resolution: number,
  provider: ChunkTerrainProvider & {
    computeBiomeWeightsAtPosition(
      worldX: number,
      worldZ: number,
    ): { biomeWeightMap: Map<string, number>; totalWeight: number };
    getBiomeId(biomeName: string): number;
    getBiomeColor(biomeName: string): { r: number; g: number; b: number };
    readonly WATER_LEVEL_NORMALIZED: number;
    readonly SHORELINE_THRESHOLD: number;
    readonly SHORELINE_STRENGTH: number;
    readonly MAX_HEIGHT: number;
  },
  skirtDrop: number,
): ChunkGeometryResult {
  const segments = resolution;
  const halfSize = size * 0.5;
  const gridStep = size / (segments - 1);

  const gRes = segments + 2;
  const overflowGrid = new Float32Array(gRes * gRes);
  const heightData = new Float32Array(segments * segments);

  for (let gz = 0; gz < gRes; gz++) {
    const localZ = -halfSize + (gz - 1) * gridStep;
    const worldZ = centerZ + localZ;
    for (let gx = 0; gx < gRes; gx++) {
      const localX = -halfSize + (gx - 1) * gridStep;
      const worldX = centerX + localX;
      const h = provider.getHeightAtComputed(worldX, worldZ);
      overflowGrid[gz * gRes + gx] = h;
      if (gx >= 1 && gx <= segments && gz >= 1 && gz <= segments) {
        heightData[(gz - 1) * segments + (gx - 1)] = h;
      }
    }
  }

  const skirtCount = segments * 4;
  const totalVertices = segments * segments + skirtCount;
  const positions = new Float32Array(totalVertices * 3);
  const normalArr = new Float32Array(totalVertices * 3);
  const colors = new Float32Array(totalVertices * 3);
  const biomeIds = new Float32Array(totalVertices);
  const roadInfluences = new Float32Array(totalVertices);

  const invTwoStep = 1 / (2 * gridStep);
  const normalBuf = new Float32Array(segments * segments * 3);

  for (let iz = 0; iz < segments; iz++) {
    const gz = iz + 1;
    for (let ix = 0; ix < segments; ix++) {
      const gx = ix + 1;
      const hL = overflowGrid[gz * gRes + (gx - 1)];
      const hR = overflowGrid[gz * gRes + (gx + 1)];
      const hD = overflowGrid[(gz - 1) * gRes + gx];
      const hU = overflowGrid[(gz + 1) * gRes + gx];
      const dhdx = (hR - hL) * invTwoStep;
      const dhdz = (hU - hD) * invTwoStep;
      const nx = -dhdx;
      const ny = 1;
      const nz = -dhdz;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const i3 = (iz * segments + ix) * 3;
      normalBuf[i3] = nx / len;
      normalBuf[i3 + 1] = ny / len;
      normalBuf[i3 + 2] = nz / len;
    }
  }

  for (let iz = 0; iz < segments; iz++) {
    const localZ = -halfSize + iz * gridStep;
    const worldZ = centerZ + localZ;
    for (let ix = 0; ix < segments; ix++) {
      const localX = -halfSize + ix * gridStep;
      const worldX = centerX + localX;
      const idx = iz * segments + ix;
      const i3 = idx * 3;
      let height = heightData[idx];

      const flatZone = provider.getFlatZoneAt(worldX, worldZ);
      if (flatZone) {
        height = flatZone.height;
      }

      positions[i3] = localX;
      positions[i3 + 1] = height;
      positions[i3 + 2] = localZ;
      normalArr[i3] = normalBuf[i3];
      normalArr[i3 + 1] = normalBuf[i3 + 1];
      normalArr[i3 + 2] = normalBuf[i3 + 2];

      const { biomeWeightMap, totalWeight } =
        provider.computeBiomeWeightsAtPosition(worldX, worldZ);
      const normalizedHeight = height / provider.MAX_HEIGHT;

      let dominantBiome = "plains";
      let dominantWeight = -Infinity;
      let cr = 0,
        cg = 0,
        cb = 0;

      if (totalWeight > 0) {
        const invTotal = 1 / totalWeight;
        for (const [type, rawWeight] of biomeWeightMap) {
          const weight = rawWeight * invTotal;
          if (weight > dominantWeight) {
            dominantWeight = weight;
            dominantBiome = type;
          }
          const bc = provider.getBiomeColor(type);
          cr += bc.r * weight;
          cg += bc.g * weight;
          cb += bc.b * weight;
        }
      } else {
        const bc = provider.getBiomeColor("plains");
        cr = bc.r;
        cg = bc.g;
        cb = bc.b;
      }

      biomeIds[idx] = provider.getBiomeId(dominantBiome);

      const waterLevel = provider.WATER_LEVEL_NORMALIZED;
      const shoreThreshold = provider.SHORELINE_THRESHOLD;
      if (normalizedHeight > waterLevel && normalizedHeight < shoreThreshold) {
        const shoreFactor =
          (1.0 -
            (normalizedHeight - waterLevel) / (shoreThreshold - waterLevel)) *
          provider.SHORELINE_STRENGTH;
        cr += (0.545 - cr) * shoreFactor;
        cg += (0.451 - cg) * shoreFactor;
        cb += (0.333 - cb) * shoreFactor;
      }

      colors[i3] = cr;
      colors[i3 + 1] = cg;
      colors[i3 + 2] = cb;

      const roadTileX = Math.floor(worldX / provider.TILE_SIZE);
      const roadTileZ = Math.floor(worldZ / provider.TILE_SIZE);
      roadInfluences[idx] = provider.calculateRoadInfluenceAtVertex(
        worldX,
        worldZ,
        roadTileX,
        roadTileZ,
      );
    }
  }

  // Skirt and index generation (reuse the same logic)
  let skirtIdx = segments * segments;
  const copyEdgeVertex = (mainIdx: number) => {
    const si3 = skirtIdx * 3;
    const mi3 = mainIdx * 3;
    positions[si3] = positions[mi3];
    positions[si3 + 1] = positions[mi3 + 1] - skirtDrop;
    positions[si3 + 2] = positions[mi3 + 2];
    normalArr[si3] = normalArr[mi3];
    normalArr[si3 + 1] = normalArr[mi3 + 1];
    normalArr[si3 + 2] = normalArr[mi3 + 2];
    colors[si3] = colors[mi3];
    colors[si3 + 1] = colors[mi3 + 1];
    colors[si3 + 2] = colors[mi3 + 2];
    biomeIds[skirtIdx] = biomeIds[mainIdx];
    roadInfluences[skirtIdx] = roadInfluences[mainIdx];
    skirtIdx++;
  };

  for (let ix = 0; ix < segments; ix++) copyEdgeVertex(ix);
  for (let ix = 0; ix < segments; ix++)
    copyEdgeVertex((segments - 1) * segments + ix);
  for (let iz = 0; iz < segments; iz++) copyEdgeVertex(iz * segments);
  for (let iz = 0; iz < segments; iz++)
    copyEdgeVertex(iz * segments + (segments - 1));

  const subs = segments - 1;
  const totalIndices = (subs * subs + subs * 4) * 6;
  const indices = new Uint32Array(totalIndices);
  let ii = 0;

  for (let iz = 0; iz < subs; iz++) {
    for (let ix = 0; ix < subs; ix++) {
      const a = iz * segments + ix;
      const b = a + 1;
      const c = a + segments;
      const d = c + 1;
      indices[ii++] = a;
      indices[ii++] = c;
      indices[ii++] = b;
      indices[ii++] = b;
      indices[ii++] = c;
      indices[ii++] = d;
    }
  }

  const skirtBase = segments * segments;
  const northSkirtBase = skirtBase;
  const southSkirtBase = skirtBase + segments;
  const westSkirtBase = skirtBase + segments * 2;
  const eastSkirtBase = skirtBase + segments * 3;

  for (let ix = 0; ix < subs; ix++) {
    indices[ii++] = northSkirtBase + ix;
    indices[ii++] = ix;
    indices[ii++] = northSkirtBase + ix + 1;
    indices[ii++] = northSkirtBase + ix + 1;
    indices[ii++] = ix;
    indices[ii++] = ix + 1;
  }
  for (let ix = 0; ix < subs; ix++) {
    const mainA = (segments - 1) * segments + ix;
    indices[ii++] = mainA;
    indices[ii++] = southSkirtBase + ix;
    indices[ii++] = mainA + 1;
    indices[ii++] = mainA + 1;
    indices[ii++] = southSkirtBase + ix;
    indices[ii++] = southSkirtBase + ix + 1;
  }
  for (let iz = 0; iz < subs; iz++) {
    const mainA = iz * segments;
    const mainB = (iz + 1) * segments;
    indices[ii++] = mainA;
    indices[ii++] = westSkirtBase + iz;
    indices[ii++] = mainB;
    indices[ii++] = mainB;
    indices[ii++] = westSkirtBase + iz;
    indices[ii++] = westSkirtBase + iz + 1;
  }
  for (let iz = 0; iz < subs; iz++) {
    const mainA = iz * segments + (segments - 1);
    const mainB = (iz + 1) * segments + (segments - 1);
    indices[ii++] = eastSkirtBase + iz;
    indices[ii++] = mainA;
    indices[ii++] = eastSkirtBase + iz + 1;
    indices[ii++] = eastSkirtBase + iz + 1;
    indices[ii++] = mainA;
    indices[ii++] = mainB;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normalArr, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("biomeId", new THREE.BufferAttribute(biomeIds, 1));
  geometry.setAttribute(
    "roadInfluence",
    new THREE.BufferAttribute(roadInfluences, 1),
  );
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { geometry, heightData };
}
