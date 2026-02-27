/**
 * TerrainQuadChunkGenerator — Generates terrain geometry for quad-tree chunks.
 *
 * Produces variable-resolution PlaneGeometry with skirt edges for seamless
 * LOD transitions. Delegates to TerrainSystem for height/biome/road queries.
 *
 * CLIENT-ONLY: Server terrain uses the flat tile grid.
 */

import THREE from "../../../extras/three/three";
import type { TerrainQuadNode } from "./TerrainQuadTree";

/**
 * Height/biome/road query callbacks from TerrainSystem.
 * These decouple the generator from the full TerrainSystem class.
 */
export interface ChunkTerrainProvider {
  getHeightAtComputed(worldX: number, worldZ: number): number;
  computeBiomeWeightsAtPosition(
    worldX: number,
    worldZ: number,
  ): { biomeWeightMap: Map<string, number>; totalWeight: number };
  calculateRoadInfluenceAtVertex(
    worldX: number,
    worldZ: number,
    tileX: number,
    tileZ: number,
  ): number;
  getBiomeId(biomeName: string): number;
  getBiomeColor(biomeName: string): { r: number; g: number; b: number };
  getFlatZoneAt(worldX: number, worldZ: number): unknown | null;
  readonly WATER_LEVEL_NORMALIZED: number;
  readonly SHORELINE_THRESHOLD: number;
  readonly SHORELINE_STRENGTH: number;
  readonly MAX_HEIGHT: number;
  readonly TILE_SIZE: number;
}

export interface ChunkGeometryResult {
  geometry: THREE.BufferGeometry;
  heightData: Float32Array;
}

/**
 * Generate terrain geometry for a single quad-tree chunk node.
 *
 * The geometry is a grid of `resolution x resolution` vertices centered
 * at `(node.centerX, 0, node.centerZ)` with world size `node.size`.
 * Skirt geometry is appended at all 4 edges.
 */
export function generateQuadChunkGeometry(
  node: TerrainQuadNode,
  provider: ChunkTerrainProvider,
  skirtDrop: number,
): ChunkGeometryResult {
  const size = node.size;
  const resolution = node.resolution;
  const segments = resolution; // vertices per axis
  const centerX = node.centerX;
  const centerZ = node.centerZ;
  const halfSize = size * 0.5;
  const gridStep = size / (segments - 1);

  // Overflow grid for normal computation: (segments+2)^2
  const gRes = segments + 2;
  const overflowGrid = new Float32Array(gRes * gRes);

  // Main grid heights
  const heightData = new Float32Array(segments * segments);

  // Fill overflow grid (includes 1-cell border)
  for (let gz = 0; gz < gRes; gz++) {
    const localZ = -halfSize + (gz - 1) * gridStep;
    const worldZ = centerZ + localZ;
    for (let gx = 0; gx < gRes; gx++) {
      const localX = -halfSize + (gx - 1) * gridStep;
      const worldX = centerX + localX;
      const h = provider.getHeightAtComputed(worldX, worldZ);
      overflowGrid[gz * gRes + gx] = h;

      // Store in main grid (interior only)
      if (gx >= 1 && gx <= segments && gz >= 1 && gz <= segments) {
        const ix = gx - 1;
        const iz = gz - 1;
        heightData[iz * segments + ix] = h;
      }
    }
  }

  // Skirt: 4 edges × segments vertices + 4 corners (approximate)
  const skirtCount = segments * 4;
  const totalVertices = segments * segments + skirtCount;
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const colors = new Float32Array(totalVertices * 3);
  const biomeIds = new Float32Array(totalVertices);
  const roadInfluences = new Float32Array(totalVertices);

  // Compute normals via centered finite differences
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

  // Fill main grid positions, normals, colors, biomeIds, roadInfluences
  for (let iz = 0; iz < segments; iz++) {
    const localZ = -halfSize + iz * gridStep;
    const worldZ = centerZ + localZ;

    for (let ix = 0; ix < segments; ix++) {
      const localX = -halfSize + ix * gridStep;
      const worldX = centerX + localX;
      const idx = iz * segments + ix;
      const i3 = idx * 3;

      const height = heightData[idx];

      positions[i3] = localX;
      positions[i3 + 1] = height;
      positions[i3 + 2] = localZ;

      normals[i3] = normalBuf[i3];
      normals[i3 + 1] = normalBuf[i3 + 1];
      normals[i3 + 2] = normalBuf[i3 + 2];

      // Biome color blending
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

      // Shoreline tint
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

      // Road influence
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

  // =========================================================================
  // Skirt geometry — duplicate edge vertices with Y lowered by skirtDrop
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

  // North edge (iz=0)
  for (let ix = 0; ix < segments; ix++) {
    copyEdgeVertex(ix);
  }
  // South edge (iz=segments-1)
  for (let ix = 0; ix < segments; ix++) {
    copyEdgeVertex((segments - 1) * segments + ix);
  }
  // West edge (ix=0)
  for (let iz = 0; iz < segments; iz++) {
    copyEdgeVertex(iz * segments);
  }
  // East edge (ix=segments-1)
  for (let iz = 0; iz < segments; iz++) {
    copyEdgeVertex(iz * segments + (segments - 1));
  }

  // =========================================================================
  // Indices for main grid
  // =========================================================================
  const subs = segments - 1;
  const mainFaceCount = subs * subs;
  // Skirt faces: (segments-1) * 4 edges * 2 triangles
  const skirtFaceCount = subs * 4;
  const totalIndices = (mainFaceCount + skirtFaceCount) * 6;
  const indices = new Uint32Array(totalIndices);
  let ii = 0;

  // Main grid
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

  // Skirt indices
  const skirtBase = segments * segments;
  const northSkirtBase = skirtBase;
  const southSkirtBase = skirtBase + segments;
  const westSkirtBase = skirtBase + segments * 2;
  const eastSkirtBase = skirtBase + segments * 3;

  // North skirt (iz=0, connect main row to skirt row below)
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

  // South skirt
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

  // West skirt
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

  // East skirt
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
