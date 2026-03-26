// @ts-nocheck -- TSL type definitions are incomplete for Fn() callbacks and node reassignment
/**
 * GrassVisualManager — Generates instanced grass meshes aligned with the
 * terrain quad-tree. Each max-depth leaf node gets an InstancedMesh using
 * a GLB grass blade model, with CPU-baked terrain heights and TSL distance fade.
 *
 * Follows the same QuadTreeListener pattern as WaterVisualManager:
 * the terrain quad-tree drives split/merge; this manager only reacts to
 * onNodeNeedsGeometry / onNodeDestroyGeometry events.
 *
 * CLIENT-ONLY: Only used when USE_QUADTREE_LOD is true.
 */

import THREE, {
  uniform,
  Fn,
  float,
  sin,
  mix,
  time,
  positionLocal,
  attribute,
  hash,
  cos,
} from "../../../extras/three/three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import type { TerrainQuadNode, QuadTreeListener } from "./TerrainQuadTree";
import { modelCache } from "../../../utils/rendering/ModelCache";
import type { World } from "../../../core/World";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GRASS_CONFIG = {
  INSTANCES_PER_CHUNK: 4000,
  SCALE_MIN: 0.6,
  SCALE_MAX: 1.4,
  FADE_START: 30,
  FADE_END: 45,
  WIND_SPEED: 1.2,
  WIND_STRENGTH: 0.08,
  BASE_COLOR: new THREE.Color(0x2d5a1e),
  TIP_COLOR: new THREE.Color(0x7bc950),
  MAX_SLOPE: 0.7,
  SEED: 73856093,
  MODEL_PATH: "grass/grassBlade1.glb",
};

// ---------------------------------------------------------------------------
// Seeded PRNG (deterministic blade placement per chunk)
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
// Types
// ---------------------------------------------------------------------------

interface GrassChunk {
  nodeId: number;
  mesh: THREE.InstancedMesh;
  /** World-space bounding box covering the full terrain chunk extent */
  box: THREE.Box3;
}

// ---------------------------------------------------------------------------
// GrassVisualManager
// ---------------------------------------------------------------------------

export class GrassVisualManager implements QuadTreeListener {
  private container: THREE.Group;
  private getHeightAt: (x: number, z: number) => number;
  private getRoadInfluence: (wx: number, wz: number) => number;
  private waterThreshold: number;
  private world: World;
  private chunks = new Map<string, GrassChunk>();
  private material: MeshStandardNodeMaterial | null = null;

  private uPlayerPos = uniform(new THREE.Vector2(0, 0));

  /** Reusable frustum + matrix for CPU-side per-chunk visibility testing */
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();

  /** Loaded GLB blade geometry (null until async load completes) */
  private bladeGeometry: THREE.BufferGeometry | null = null;
  /** Height of the loaded blade model (for normalizing tipness) */
  private bladeModelHeight = 1;
  /** Nodes that arrived before the model finished loading */
  private pendingNodes: TerrainQuadNode[] = [];
  private modelLoaded = false;

  constructor(
    container: THREE.Group,
    world: World,
    getHeightAt: (x: number, z: number) => number,
    waterThreshold: number,
    getRoadInfluence: (wx: number, wz: number) => number,
  ) {
    this.container = container;
    this.world = world;
    this.getHeightAt = getHeightAt;
    this.waterThreshold = waterThreshold;
    this.getRoadInfluence = getRoadInfluence;

    this.loadGrassModel();
  }

  // -- Model loading --------------------------------------------------------

  private async loadGrassModel(): Promise<void> {
    try {
      const baseUrl = (this.world.assetsUrl || "").replace(/\/$/, "");
      const fullPath = `${baseUrl}/${GRASS_CONFIG.MODEL_PATH}`;
      const { scene } = await modelCache.loadModel(fullPath, this.world);

      let geometry: THREE.BufferGeometry | null = null;
      scene.traverse((child: THREE.Object3D) => {
        if (!geometry && child instanceof THREE.Mesh && child.geometry) {
          geometry = child.geometry;
        }
      });

      if (!geometry) {
        console.warn("[GrassVisualManager] No geometry found in grass GLB");
        return;
      }

      this.bladeGeometry = geometry;

      // Compute model height for tipness normalization
      geometry.computeBoundingBox();
      if (geometry.boundingBox) {
        this.bladeModelHeight = Math.max(
          0.01,
          geometry.boundingBox.max.y - geometry.boundingBox.min.y,
        );
      }

      this.material = this.createMaterial();
      this.modelLoaded = true;

      console.log(
        `[GrassVisualManager] Grass model loaded (${geometry.attributes.position.count} verts, h=${this.bladeModelHeight.toFixed(2)}m)`,
      );

      // Process any nodes that arrived before the model was ready
      for (const node of this.pendingNodes) {
        this.createChunkMesh(node);
      }
      this.pendingNodes.length = 0;
    } catch (err) {
      console.error("[GrassVisualManager] Failed to load grass model:", err);
    }
  }

  // -- Public API -----------------------------------------------------------

  update(playerX: number, playerZ: number, camera?: THREE.Camera): void {
    this.uPlayerPos.value.set(playerX, playerZ);

    if (!camera || this.chunks.size === 0) return;

    // Build frustum from camera (same approach as portfolio project)
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    for (const [, chunk] of this.chunks) {
      chunk.mesh.visible = this.frustum.intersectsBox(chunk.box);
    }
  }

  // -- QuadTreeListener -----------------------------------------------------

  onNodeNeedsGeometry(node: TerrainQuadNode): void {
    if (!node.isMaxDepth) return;

    const key = this.chunkKey(node);
    if (this.chunks.has(key)) return;

    if (!this.modelLoaded) {
      this.pendingNodes.push(node);
      return;
    }

    this.createChunkMesh(node);
  }

  onNodeDestroyGeometry(node: TerrainQuadNode): void {
    const key = this.chunkKey(node);
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    if (chunk.mesh.parent) chunk.mesh.parent.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    this.chunks.delete(key);

    // Also remove from pending queue if present
    const pi = this.pendingNodes.indexOf(node);
    if (pi >= 0) this.pendingNodes.splice(pi, 1);
  }

  destroy(): void {
    for (const [, chunk] of this.chunks) {
      if (chunk.mesh.parent) chunk.mesh.parent.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
    }
    this.chunks.clear();
    this.pendingNodes.length = 0;
    if (this.material) this.material.dispose();
    if (this.container.parent) this.container.parent.remove(this.container);
  }

  // -- Chunk mesh creation --------------------------------------------------

  private createChunkMesh(node: TerrainQuadNode): void {
    if (!this.bladeGeometry || !this.material) return;

    const key = this.chunkKey(node);
    if (this.chunks.has(key)) return;

    const instanceData = this.generateInstanceData(node);
    if (!instanceData || instanceData.count === 0) return;

    // Clone geometry and attach instanced attributes
    const geo = this.bladeGeometry.clone();
    geo.setAttribute(
      "instanceOffset",
      new THREE.InstancedBufferAttribute(instanceData.offsets, 3),
    );
    geo.setAttribute(
      "instanceRotScale",
      new THREE.InstancedBufferAttribute(instanceData.rotScales, 2),
    );
    geo.setAttribute(
      "instanceHash",
      new THREE.InstancedBufferAttribute(instanceData.hashes, 1),
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

    // Instance matrices set to identity — positioning is handled in positionNode
    const identity = new THREE.Matrix4();
    for (let i = 0; i < instanceData.count; i++) {
      mesh.setMatrixAt(i, identity);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Bounding box covering the full terrain chunk (for CPU frustum culling)
    const half = node.halfSize;
    const box = new THREE.Box3(
      new THREE.Vector3(node.centerX - half, -50, node.centerZ - half),
      new THREE.Vector3(node.centerX + half, 200, node.centerZ + half),
    );

    this.container.add(mesh);
    this.chunks.set(key, { nodeId: node.id, mesh, box });
  }

  // -- Instance data generation ---------------------------------------------

  private generateInstanceData(node: TerrainQuadNode): {
    offsets: Float32Array;
    rotScales: Float32Array;
    hashes: Float32Array;
    count: number;
  } | null {
    const maxCount = GRASS_CONFIG.INSTANCES_PER_CHUNK;
    const rng = mulberry32(
      GRASS_CONFIG.SEED ^
        ((node.centerX * 374761393 + node.centerZ * 668265263) | 0),
    );

    const offsets = new Float32Array(maxCount * 3);
    const rotScales = new Float32Array(maxCount * 2);
    const hashes = new Float32Array(maxCount);

    let count = 0;

    for (let i = 0; i < maxCount; i++) {
      const lx = (rng() - 0.5) * node.size;
      const lz = (rng() - 0.5) * node.size;
      const bladeRng = rng();

      const wx = node.centerX + lx;
      const wz = node.centerZ + lz;
      const ty = this.getHeightAt(wx, wz);

      if (ty < this.waterThreshold + 0.1) continue;
      if (this.getRoadInfluence(wx, wz) > 0.3) continue;

      // Slope check
      const sd = 0.5;
      const hL = this.getHeightAt(wx - sd, wz);
      const hR = this.getHeightAt(wx + sd, wz);
      const hD = this.getHeightAt(wx, wz - sd);
      const hU = this.getHeightAt(wx, wz + sd);
      const dx = hR - hL;
      const dz = hU - hD;
      if (
        dx * dx + dz * dz >
        GRASS_CONFIG.MAX_SLOPE * GRASS_CONFIG.MAX_SLOPE * 4 * sd * sd
      )
        continue;

      offsets[count * 3] = lx;
      offsets[count * 3 + 1] = ty;
      offsets[count * 3 + 2] = lz;

      const rotation = rng() * Math.PI * 2;
      const scale =
        GRASS_CONFIG.SCALE_MIN +
        bladeRng * (GRASS_CONFIG.SCALE_MAX - GRASS_CONFIG.SCALE_MIN);
      rotScales[count * 2] = rotation;
      rotScales[count * 2 + 1] = scale;

      hashes[count] = bladeRng;
      count++;
    }

    if (count === 0) return null;

    return {
      offsets: offsets.slice(0, count * 3),
      rotScales: rotScales.slice(0, count * 2),
      hashes: hashes.slice(0, count),
      count,
    };
  }

  // -- TSL Material ---------------------------------------------------------

  private createMaterial(): MeshStandardNodeMaterial {
    const mat = new MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;
    mat.transparent = false;
    mat.depthWrite = true;

    const uBaseColor = uniform(GRASS_CONFIG.BASE_COLOR);
    const uTipColor = uniform(GRASS_CONFIG.TIP_COLOR);
    const uWindSpeed = uniform(GRASS_CONFIG.WIND_SPEED);
    const uWindStrength = uniform(GRASS_CONFIG.WIND_STRENGTH);
    const uModelHeight = uniform(this.bladeModelHeight);

    // --- positionNode: instance placement + Y rotation + wind + distance fade ---
    mat.positionNode = Fn(() => {
      const localPos = positionLocal.toVar("gp");

      // Per-instance data
      const offset = attribute("instanceOffset", "vec3");
      const rotScale = attribute("instanceRotScale", "vec2");
      const rot = rotScale.x;
      const scale = rotScale.y;

      // Tipness: normalized Y position within the blade model (0=base, 1=tip)
      const tipness = localPos.y.div(uModelHeight).clamp(0.0, 1.0);

      // Scale the blade
      localPos.x.assign(localPos.x.mul(scale));
      localPos.y.assign(localPos.y.mul(scale));
      localPos.z.assign(localPos.z.mul(scale));

      // Rotate around Y axis
      const cosR = cos(rot);
      const sinR = sin(rot);
      const rx = localPos.x.mul(cosR).sub(localPos.z.mul(sinR));
      const rz = localPos.x.mul(sinR).add(localPos.z.mul(cosR));
      localPos.x.assign(rx);
      localPos.z.assign(rz);

      // Translate to instance position (offset is chunk-local XZ + baked terrainY)
      localPos.x.addAssign(offset.x);
      localPos.y.addAssign(offset.y);
      localPos.z.addAssign(offset.z);

      // Wind: displace tips in XZ using sine waves
      const wt = time.mul(uWindSpeed);
      localPos.x.addAssign(
        sin(wt.add(offset.x.mul(0.8)).add(offset.z.mul(0.6)))
          .mul(uWindStrength)
          .mul(tipness),
      );
      localPos.z.addAssign(
        sin(wt.mul(0.7).add(offset.x.mul(0.5)).add(offset.z.mul(0.9)).add(2.0))
          .mul(uWindStrength)
          .mul(tipness)
          .mul(0.7),
      );

      return localPos;
    })();

    // --- colorNode: base-to-tip gradient with per-instance variation ---
    mat.colorNode = Fn(() => {
      const instHash = attribute("instanceHash", "float");
      const tipness = positionLocal.y.div(uModelHeight).clamp(0.0, 1.0);

      const col = mix(uBaseColor, uTipColor, tipness).toVar("gc");

      const v = hash(instHash.mul(1234.5)).mul(0.12).sub(0.06);
      col.r.addAssign(v);
      col.g.addAssign(v.mul(0.6));
      col.b.addAssign(v.mul(-0.3));

      return col;
    })();

    return mat;
  }

  // -- Helpers --------------------------------------------------------------

  private chunkKey(node: TerrainQuadNode): string {
    return `gq_${node.id}_d${node.depth}_${node.centerX}_${node.centerZ}`;
  }
}
