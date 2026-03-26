// @ts-nocheck -- TSL type definitions are incomplete for Fn() callbacks and node reassignment
/**
 * GrassVisualManager — Procedural instanced grass clumps aligned with the
 * terrain quad-tree. Each clump is a single geometry containing multiple
 * blades with pre-baked local offsets, rotations and height variation.
 * Each max-depth quad-tree leaf gets one InstancedMesh of clumps.
 *
 * Follows the same QuadTreeListener pattern as WaterVisualManager.
 * CLIENT-ONLY: Only used when USE_QUADTREE_LOD is true.
 */

import THREE, {
  uniform,
  Fn,
  float,
  sin,
  mix,
  smoothstep,
  time,
  positionLocal,
  attribute,
  cos,
  uv,
  pow,
  vec3,
  dot,
  normalize,
  add,
  mul,
  sub,
} from "../../../extras/three/three";
import { SUN_LIGHT } from "./LightingConfig";
import { TERRAIN_SHADE } from "./TerrainShader";
import { MeshStandardNodeMaterial } from "three/webgpu";
import type { TerrainQuadNode, QuadTreeListener } from "./TerrainQuadTree";

// sRGB → linear conversion.  computeTerrainColorCPU returns sRGB-space values
// (its constants match the textures' sRGB averages). The GPU terrain shader
// auto-converts sRGB textures to linear before blending. Float vertex
// attributes have NO automatic conversion, so we must do it on the CPU side
// before writing to instanceGroundColor.
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// ---------------------------------------------------------------------------
// Configuration — tweak these to control grass appearance & performance
// ---------------------------------------------------------------------------

export const GRASS_CONFIG = {
  // -- Density & distribution -----------------------------------------------
  /** Average distance between clump centers in meters (lower = denser) */
  CLUMP_SPACING: 0.7,

  // -- Clump composition ----------------------------------------------------
  /** Number of blades baked into each clump geometry */
  BLADES_PER_CLUMP: 24,
  /** Outer radius of the clump ring in meters */
  CLUMP_RADIUS: 0.7,
  /** Inner radius ratio (0-1, blades placed between inner*radius and radius) */
  CLUMP_INNER_RATIO: 0.05,

  // -- Blade shape ----------------------------------------------------------
  /** Segments per blade (4 rows of 2 verts + 1 tip = 9 verts) */
  BLADE_SEGMENTS: 3,
  /** Blade width scales with height: width = height * WIDTH_RATIO */
  BLADE_WIDTH_RATIO: 0.04,
  /** Blade min height in world units */
  BLADE_HEIGHT_MIN: 0.45,
  /** Blade max height in world units */
  BLADE_HEIGHT_MAX: 1.15,
  /** Arc curvature ratio (arc distance ≈ height * this) */
  BLADE_ARC_RATIO: 0.18,
  /** Tip taper (0 = rectangle, 1 = full point) */
  BLADE_TAPER: 0.85,

  // -- Per-instance variation -----------------------------------------------
  /** Clump-level scale range */
  SCALE_MIN: 0.7,
  SCALE_MAX: 1.3,

  // -- Wind -----------------------------------------------------------------
  WIND_SPEED: 1.8,
  WIND_STRENGTH: 0.15,

  // -- Color ----------------------------------------------------------------
  /** Gradient power curve (higher = root color persists longer up the blade) */
  GRADIENT_FALLOFF: 1.7,

  // -- Terrain filters ------------------------------------------------------
  MAX_SLOPE: 0.7,
  /** Minimum grassWeight from terrain color function to place a clump (0-1) */
  MIN_GRASS_WEIGHT: 0.3,

  // -- LOD tiers (by distance from camera) ------------------------------------
  LOD_TIERS: [
    { maxDistance: 200, bladesPerClump: 24, bladeSegments: 3, spacingMul: 1.0 },
    { maxDistance: 400, bladesPerClump: 12, bladeSegments: 2, spacingMul: 2.0 },
    {
      maxDistance: Infinity,
      bladesPerClump: 6,
      bladeSegments: 1,
      spacingMul: 4.0,
    },
  ],
  LOD_HYSTERESIS: 0.1,

  /** Deterministic seed */
  SEED: 73856093,
};

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Procedural clump geometry — sunflower-spiral blade arrangement with baked
// arc curvature, per-blade rotation/height/width variation.
// ---------------------------------------------------------------------------

function createClumpGeometry(
  bladesPerClump = GRASS_CONFIG.BLADES_PER_CLUMP,
  bladeSegments = GRASS_CONFIG.BLADE_SEGMENTS,
): THREE.BufferGeometry {
  const N = bladesPerClump;
  const segs = bladeSegments;
  const {
    CLUMP_RADIUS,
    CLUMP_INNER_RATIO,
    BLADE_WIDTH_RATIO,
    BLADE_HEIGHT_MIN: hMin,
    BLADE_HEIGHT_MAX: hMax,
    BLADE_ARC_RATIO,
    BLADE_TAPER: taper,
  } = GRASS_CONFIG;

  const vertsPerBlade = segs * 2 + 1;
  const trisPerBlade = (segs - 1) * 2 + 1;
  const totalVerts = vertsPerBlade * N;
  const totalIdx = trisPerBlade * 3 * N;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = new Uint16Array(totalIdx);
  const bladeHashAttr = new Float32Array(totalVerts);

  const rng = mulberry32(91827364);
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

  let vi = 0;
  let ii = 0;

  for (let b = 0; b < N; b++) {
    const t01 = b / N;
    const angle = b * GOLDEN_ANGLE;
    const rNorm = CLUMP_INNER_RATIO + (1 - CLUMP_INNER_RATIO) * Math.sqrt(t01);
    const r = rNorm * CLUMP_RADIUS;
    const jitter = (rng() - 0.5) * 0.15 * CLUMP_RADIUS;
    const ox = Math.cos(angle) * r + Math.cos(angle + 1.3) * jitter;
    const oz = Math.sin(angle) * r + Math.sin(angle + 1.3) * jitter;

    const facingAngle = angle + Math.PI * 0.5 + (rng() - 0.5) * Math.PI;
    const cr = Math.cos(facingAngle);
    const sr = Math.sin(facingAngle);

    const h = hMin + (hMax - hMin) * (0.3 + 0.7 * t01 + (rng() - 0.5) * 0.4);
    const w = h * BLADE_WIDTH_RATIO;

    const curveAngle = angle + (rng() - 0.5) * Math.PI * 0.6;
    const arcDist = h * BLADE_ARC_RATIO * (0.8 + rng() * 0.4);
    const curveDirX = Math.cos(curveAngle) * arcDist;
    const curveDirZ = Math.sin(curveAngle) * arcDist;

    const bHash = rng();
    const baseVert = vi;

    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const y = t * h;
      const hw = w * 0.5 * (1.0 - t * taper);
      const arc = t * t;
      const arcX = curveDirX * arc;
      const arcZ = curveDirZ * arc;

      for (let side = 0; side < 2; side++) {
        const lx = side === 0 ? -hw : hw;
        positions[vi * 3] = lx * cr + arcX + ox;
        positions[vi * 3 + 1] = y;
        positions[vi * 3 + 2] = lx * sr + arcZ + oz;
        normals[vi * 3] = -sr;
        normals[vi * 3 + 1] = 0;
        normals[vi * 3 + 2] = cr;
        uvs[vi * 2] = side;
        uvs[vi * 2 + 1] = t;
        bladeHashAttr[vi] = bHash;
        vi++;
      }
    }

    positions[vi * 3] = curveDirX + ox;
    positions[vi * 3 + 1] = h;
    positions[vi * 3 + 2] = curveDirZ + oz;
    normals[vi * 3] = -sr;
    normals[vi * 3 + 1] = 0;
    normals[vi * 3 + 2] = cr;
    uvs[vi * 2] = 0.5;
    uvs[vi * 2 + 1] = 1.0;
    bladeHashAttr[vi] = bHash;
    vi++;

    for (let i = 0; i < segs - 1; i++) {
      const bv = baseVert + i * 2;
      indices[ii++] = bv;
      indices[ii++] = bv + 1;
      indices[ii++] = bv + 2;
      indices[ii++] = bv + 1;
      indices[ii++] = bv + 3;
      indices[ii++] = bv + 2;
    }
    const lastRow = baseVert + (segs - 1) * 2;
    const tipIdx = baseVert + segs * 2;
    indices[ii++] = lastRow;
    indices[ii++] = lastRow + 1;
    indices[ii++] = tipIdx;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute("bladeHash", new THREE.BufferAttribute(bladeHashAttr, 1));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GrassChunk {
  nodeId: number;
  mesh: THREE.InstancedMesh;
  box: THREE.Box3;
  lodLevel: number;
  node: TerrainQuadNode;
}

// ---------------------------------------------------------------------------
// GrassVisualManager
// ---------------------------------------------------------------------------

export class GrassVisualManager implements QuadTreeListener {
  private container: THREE.Group;
  private getHeightAt: (x: number, z: number) => number;
  private getRoadInfluence: (wx: number, wz: number) => number;
  private sunDirUniform: ReturnType<typeof uniform<THREE.Vector3>>;
  private getTerrainColor: (
    wx: number,
    wz: number,
    h: number,
    slope: number,
    fW: number,
    cW: number,
  ) => { r: number; g: number; b: number; grassWeight: number };
  private getBiomeWeights: (
    wx: number,
    wz: number,
  ) => { biomeWeightMap: Map<string, number>; totalWeight: number };
  private waterThreshold: number;
  private chunks = new Map<string, GrassChunk>();
  private material: MeshStandardNodeMaterial;
  private lodGeometries: THREE.BufferGeometry[];

  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();
  private playerX = 0;
  private playerZ = 0;

  constructor(
    container: THREE.Group,
    _world: unknown,
    getHeightAt: (x: number, z: number) => number,
    waterThreshold: number,
    getRoadInfluence: (wx: number, wz: number) => number,
    getTerrainColor: (
      wx: number,
      wz: number,
      h: number,
      slope: number,
      fW: number,
      cW: number,
    ) => { r: number; g: number; b: number; grassWeight: number },
    getBiomeWeights: (
      wx: number,
      wz: number,
    ) => { biomeWeightMap: Map<string, number>; totalWeight: number },
  ) {
    this.container = container;
    this.getHeightAt = getHeightAt;
    this.waterThreshold = waterThreshold;
    this.getRoadInfluence = getRoadInfluence;
    this.getTerrainColor = getTerrainColor;
    this.getBiomeWeights = getBiomeWeights;

    this.lodGeometries = GRASS_CONFIG.LOD_TIERS.map((tier) =>
      createClumpGeometry(tier.bladesPerClump, tier.bladeSegments),
    );
    this.material = this.createMaterial();

    const tierDescs = GRASS_CONFIG.LOD_TIERS.map((t, i) => {
      const g = this.lodGeometries[i];
      return (
        `LOD${i}(${t.bladesPerClump}b/${t.bladeSegments}s, ` +
        `${g.attributes.position.count}v, ${g.index!.count / 3}t, ` +
        `<${t.maxDistance === Infinity ? "inf" : t.maxDistance}m, ` +
        `×${t.spacingMul})`
      );
    });
    console.log(
      `[GrassVisualManager] ${tierDescs.length} LOD tiers | ` +
        `spacing ${GRASS_CONFIG.CLUMP_SPACING}m | ${tierDescs.join(" | ")}`,
    );
  }

  // -- Public API -----------------------------------------------------------

  updateLighting(sunDir: THREE.Vector3): void {
    this.sunDirUniform.value.copy(sunDir);
  }

  update(playerX: number, playerZ: number, camera?: THREE.Camera): void {
    this.playerX = playerX;
    this.playerZ = playerZ;
    if (!camera || this.chunks.size === 0) return;

    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const tiers = GRASS_CONFIG.LOD_TIERS;
    const hysteresis = GRASS_CONFIG.LOD_HYSTERESIS;
    let rebuilds = 0;
    const MAX_REBUILDS_PER_FRAME = 2;

    for (const [key, chunk] of this.chunks) {
      chunk.mesh.visible = this.frustum.intersectsBox(chunk.box);
      if (!chunk.mesh.visible || rebuilds >= MAX_REBUILDS_PER_FRAME) continue;

      // Check if LOD tier should change
      const dx = chunk.node.centerX - playerX;
      const dz = chunk.node.centerZ - playerZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const currentTier = tiers[chunk.lodLevel];
      const desiredLod = this.getLodLevel(chunk.node);

      if (desiredLod !== chunk.lodLevel) {
        const boundary =
          desiredLod < chunk.lodLevel
            ? currentTier.maxDistance // moving closer: use current tier boundary
            : (tiers[desiredLod - 1]?.maxDistance ?? 0); // moving farther: use target-1 boundary
        const threshold =
          boundary *
          (1 + (desiredLod < chunk.lodLevel ? -hysteresis : hysteresis));
        const shouldSwitch =
          desiredLod < chunk.lodLevel ? dist < threshold : dist > threshold;

        if (shouldSwitch) {
          if (chunk.mesh.parent) chunk.mesh.parent.remove(chunk.mesh);
          chunk.mesh.geometry.dispose();
          this.chunks.delete(key);
          this.createChunkMesh(chunk.node, desiredLod);
          rebuilds++;
        }
      }
    }
  }

  // -- QuadTreeListener -----------------------------------------------------

  onNodeNeedsGeometry(node: TerrainQuadNode): void {
    if (!node.isMaxDepth) return;
    const key = this.chunkKey(node);
    if (this.chunks.has(key)) return;
    this.createChunkMesh(node);
  }

  onNodeDestroyGeometry(node: TerrainQuadNode): void {
    const key = this.chunkKey(node);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    if (chunk.mesh.parent) chunk.mesh.parent.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    this.chunks.delete(key);
  }

  destroy(): void {
    for (const [, chunk] of this.chunks) {
      if (chunk.mesh.parent) chunk.mesh.parent.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
    }
    this.chunks.clear();
    if (this.material) this.material.dispose();
    if (this.container.parent) this.container.parent.remove(this.container);
  }

  /**
   * Destroy and recreate all grass chunks (e.g. after road data loads).
   */
  rebuildAllChunks(): void {
    const nodes: TerrainQuadNode[] = [];
    for (const chunk of this.chunks.values()) {
      nodes.push(chunk.node);
      if (chunk.mesh.parent) chunk.mesh.parent.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
    }
    this.chunks.clear();
    for (const node of nodes) {
      node.visualChunkKey = null;
      this.createChunkMesh(node);
    }
  }

  /**
   * Invalidate grass chunks that overlap a world-space bounding box.
   * Used when flat zones are registered/unregistered so grass regenerates
   * with correct heights and placement.
   */
  invalidateRegion(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
  ): void {
    const toRebuild: TerrainQuadNode[] = [];
    for (const [key, chunk] of this.chunks) {
      const half = chunk.node.halfSize;
      const cx = chunk.node.centerX;
      const cz = chunk.node.centerZ;
      if (
        cx + half < minX ||
        cx - half > maxX ||
        cz + half < minZ ||
        cz - half > maxZ
      )
        continue;
      toRebuild.push(chunk.node);
      if (chunk.mesh.parent) chunk.mesh.parent.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      this.chunks.delete(key);
    }
    for (const node of toRebuild) {
      this.createChunkMesh(node);
    }
  }

  // -- LOD helpers -----------------------------------------------------------

  private getLodLevel(node: TerrainQuadNode): number {
    const dx = node.centerX - this.playerX;
    const dz = node.centerZ - this.playerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const tiers = GRASS_CONFIG.LOD_TIERS;
    for (let i = 0; i < tiers.length; i++) {
      if (dist < tiers[i].maxDistance) return i;
    }
    return tiers.length - 1;
  }

  // -- Chunk mesh creation --------------------------------------------------

  private createChunkMesh(node: TerrainQuadNode, lodLevel?: number): void {
    const key = this.chunkKey(node);
    if (this.chunks.has(key)) return;

    const lod = lodLevel ?? this.getLodLevel(node);
    const tier = GRASS_CONFIG.LOD_TIERS[lod];
    const instanceData = this.generateInstanceData(node, tier.spacingMul);
    if (!instanceData || instanceData.count === 0) return;

    const geo = this.lodGeometries[lod].clone();
    geo.setAttribute(
      "instanceOffset",
      new THREE.InstancedBufferAttribute(instanceData.offsets, 3),
    );
    geo.setAttribute(
      "instanceRotScaleHash",
      new THREE.InstancedBufferAttribute(instanceData.rotScaleHash, 3),
    );
    geo.setAttribute(
      "instanceGroundColor",
      new THREE.InstancedBufferAttribute(instanceData.groundColors, 3),
    );

    const mesh = new THREE.InstancedMesh(
      geo,
      this.material,
      instanceData.count,
    );
    mesh.position.set(node.centerX, 0, node.centerZ);
    mesh.name = `GrassQT_${key}`;
    mesh.frustumCulled = false;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.userData = { type: "grass", walkable: false, clickable: false };

    const identity = new THREE.Matrix4();
    for (let i = 0; i < instanceData.count; i++) {
      mesh.setMatrixAt(i, identity);
    }
    mesh.instanceMatrix.needsUpdate = true;

    const half = node.halfSize;
    const box = new THREE.Box3(
      new THREE.Vector3(node.centerX - half, -50, node.centerZ - half),
      new THREE.Vector3(node.centerX + half, 200, node.centerZ + half),
    );

    this.container.add(mesh);
    this.chunks.set(key, { nodeId: node.id, mesh, box, lodLevel: lod, node });
  }

  // -- Instance data generation ---------------------------------------------

  private generateInstanceData(
    node: TerrainQuadNode,
    spacingMul = 1,
  ): {
    offsets: Float32Array;
    rotScaleHash: Float32Array;
    groundColors: Float32Array;
    count: number;
  } | null {
    const spacing = GRASS_CONFIG.CLUMP_SPACING * spacingMul;
    const maxCount = Math.ceil((node.size * node.size) / (spacing * spacing));
    const rng = mulberry32(
      GRASS_CONFIG.SEED ^
        ((node.centerX * 374761393 + node.centerZ * 668265263) | 0),
    );

    const offsets = new Float32Array(maxCount * 3);
    const rotScaleHash = new Float32Array(maxCount * 3);
    const groundColors = new Float32Array(maxCount * 3);

    let count = 0;

    for (let i = 0; i < maxCount; i++) {
      const lx = (rng() - 0.5) * node.size;
      const lz = (rng() - 0.5) * node.size;
      const clumpRng = rng();

      const wx = node.centerX + lx;
      const wz = node.centerZ + lz;
      const ty = this.getHeightAt(wx, wz);

      if (ty < this.waterThreshold + 0.1) continue;

      const roadInf = this.getRoadInfluence(wx, wz);
      if (roadInf > 0.8) continue;

      // Slope via finite differences
      const sd = 0.5;
      const hL = this.getHeightAt(wx - sd, wz);
      const hR = this.getHeightAt(wx + sd, wz);
      const hD = this.getHeightAt(wx, wz - sd);
      const hU = this.getHeightAt(wx, wz + sd);
      const dhdx = (hR - hL) / (2 * sd);
      const dhdz = (hU - hD) / (2 * sd);
      const gradMag = Math.sqrt(dhdx * dhdx + dhdz * dhdz);
      const normalY = 1 / Math.sqrt(1 + gradMag * gradMag);
      const slope = 1 - normalY;

      if (slope > GRASS_CONFIG.MAX_SLOPE) continue;

      // Biome weights at this position
      const { biomeWeightMap, totalWeight } = this.getBiomeWeights(wx, wz);
      const invW = totalWeight > 0 ? 1 / totalWeight : 1;
      const forestW = (biomeWeightMap.get("forest") || 0) * invW;
      const canyonW = (biomeWeightMap.get("canyon") || 0) * invW;

      // Terrain color + grass weight, reduced by road influence
      const {
        r,
        g,
        b,
        grassWeight: rawGW,
      } = this.getTerrainColor(wx, wz, ty, slope, forestW, canyonW);
      const grassWeight = Math.max(0, rawGW - roadInf);

      if (grassWeight < GRASS_CONFIG.MIN_GRASS_WEIGHT) continue;
      if (clumpRng > grassWeight) continue;

      offsets[count * 3] = lx;
      offsets[count * 3 + 1] = ty;
      offsets[count * 3 + 2] = lz;

      const rotation = rng() * Math.PI * 2;
      const scale =
        GRASS_CONFIG.SCALE_MIN +
        clumpRng * (GRASS_CONFIG.SCALE_MAX - GRASS_CONFIG.SCALE_MIN);
      rotScaleHash[count * 3] = rotation;
      rotScaleHash[count * 3 + 1] = scale;
      rotScaleHash[count * 3 + 2] = clumpRng;

      groundColors[count * 3] = srgbToLinear(r);
      groundColors[count * 3 + 1] = srgbToLinear(g);
      groundColors[count * 3 + 2] = srgbToLinear(b);

      count++;
    }

    if (count === 0) return null;

    return {
      offsets: offsets.slice(0, count * 3),
      rotScaleHash: rotScaleHash.slice(0, count * 3),
      groundColors: groundColors.slice(0, count * 3),
      count,
    };
  }

  // -- TSL Material ---------------------------------------------------------

  private createMaterial(): MeshStandardNodeMaterial {
    const mat = new MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;
    mat.transparent = false;
    mat.depthWrite = true;
    mat.roughness = 1.0;
    mat.metalness = 0.0;
    mat.fog = false;

    const uWindSpeed = uniform(GRASS_CONFIG.WIND_SPEED);
    const uWindStrength = uniform(GRASS_CONFIG.WIND_STRENGTH);
    const uBladeHeight = uniform(GRASS_CONFIG.BLADE_HEIGHT_MAX);
    this.sunDirUniform = uniform(
      new THREE.Vector3(...SUN_LIGHT.DEFAULT_DIRECTION),
    );

    mat.positionNode = Fn(() => {
      const localPos = positionLocal.toVar("gp");

      const offset = attribute("instanceOffset", "vec3");
      const rsh = attribute("instanceRotScaleHash", "vec3");
      const rot = rsh.x;
      const scale = rsh.y;

      const t = uv().y;

      // Scale entire clump
      localPos.x.assign(localPos.x.mul(scale));
      localPos.y.assign(localPos.y.mul(scale));
      localPos.z.assign(localPos.z.mul(scale));

      // Rotate entire clump around Y — snapshot x/z first because TSL assign
      // is sequential in WGSL (second assign would read the modified first).
      const cosR = cos(rot);
      const sinR = sin(rot);
      const preRotX = localPos.x.toVar("preRotX");
      const preRotZ = localPos.z.toVar("preRotZ");
      localPos.x.assign(preRotX.mul(cosR).sub(preRotZ.mul(sinR)));
      localPos.z.assign(preRotX.mul(sinR).add(preRotZ.mul(cosR)));

      // Wind: displace tips via sine waves keyed to world-space offset
      const wt = time.mul(uWindSpeed);
      const bendFactor = pow(t, float(1.8));
      localPos.x.addAssign(
        sin(wt.add(offset.x.mul(0.35)).add(offset.z.mul(0.12)))
          .mul(uWindStrength)
          .mul(bendFactor)
          .mul(uBladeHeight),
      );
      localPos.z.addAssign(
        sin(
          wt.mul(0.67).add(offset.x.mul(0.18)).add(offset.z.mul(0.28)).add(2.0),
        )
          .mul(uWindStrength)
          .mul(0.55)
          .mul(bendFactor)
          .mul(uBladeHeight),
      );

      // Translate to instance world position (chunk-local XZ + baked terrainY)
      localPos.x.addAssign(offset.x);
      localPos.y.addAssign(offset.y);
      localPos.z.addAssign(offset.z);

      return localPos;
    })();

    // All normals point up so PBR lighting is uniform across all blades
    mat.normalNode = vec3(0, 1, 0);

    const uSunDir = this.sunDirUniform;

    mat.colorNode = Fn(() => {
      const groundCol = attribute("instanceGroundColor", "vec3");
      const t = uv().y; // 0 = root, 1 = tip

      const colorLerp = smoothstep(float(0.0), float(0.8), t);
      const rootCol = groundCol.mul(float(1.5));
      const baseCol = mix(rootCol, groundCol, colorLerp).toVar("grassBaseCol");

      // Half-lambert anime shade — same as terrain shader so grass
      // blends visually at the root boundary.
      const sunDir = normalize(vec3(uSunDir));
      const NdotL = dot(vec3(0, 1, 0), sunDir);
      const halfLambert = add(mul(NdotL, float(0.5)), float(0.5));
      const shadeFactor = sub(float(1.0), halfLambert);
      const coolTint = vec3(...TERRAIN_SHADE.TINT_COLOR);
      const tintedBase = mul(baseCol, coolTint);
      baseCol.assign(
        mix(
          baseCol,
          tintedBase,
          mul(shadeFactor, float(TERRAIN_SHADE.STRENGTH)),
        ),
      );

      return baseCol;
    })();

    return mat;
  }

  // -- Helpers --------------------------------------------------------------

  private chunkKey(node: TerrainQuadNode): string {
    return `gq_${node.id}_d${node.depth}_${node.centerX}_${node.centerZ}`;
  }
}
