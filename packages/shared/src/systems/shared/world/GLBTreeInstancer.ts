/**
 * GLBTreeInstancer - InstancedMesh-based rendering for GLB-loaded trees.
 *
 * Instead of cloning the full GLB scene per tree (which deep-copies all
 * geometry buffers and causes FPS drops), this module loads each model
 * once, extracts its geometry by reference, and renders all instances
 * of that model via a single THREE.InstancedMesh per LOD level.
 *
 * LOD0, LOD1, and LOD2 each get their own InstancedMesh. The instancer
 * performs distance-based LOD switching per-instance every frame by
 * moving instances between pools (matrix swaps + count adjustment).
 *
 * ResourceEntity calls addInstance/removeInstance/setDepleted. It does
 * NOT need to track whether it's instanced — those calls are safe no-ops
 * when the entity isn't registered.
 *
 * @module GLBTreeInstancer
 */

import THREE from "../../../extras/three/three";
import type { World } from "../../../core/World";
import { modelCache } from "../../../utils/rendering/ModelCache";
import {
  createTreeDissolveMaterial,
  GPU_VEG_CONFIG,
  type DissolveMaterial,
  type TreeDissolveMaterial,
} from "./GPUMaterials";
import { getLODDistances } from "./LODConfig";

const MAX_INSTANCES = 512;

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _swapMatrix = new THREE.Matrix4();

interface TreeSlot {
  entityId: string;
  position: THREE.Vector3;
  rotation: number;
  scale: number;
  depletedScale: number;
  yOffset: number;
  currentLOD: 0 | 1 | 2;
  depleted: boolean;
}

interface LODPool {
  /** One InstancedMesh per sub-mesh/primitive in the GLB */
  meshes: THREE.InstancedMesh[];
  materials: DissolveMaterial[];
  /** entityId → slot index (same across all meshes) */
  slots: Map<string, number>;
  activeCount: number;
  dirty: boolean;
  /** Shared backing array for per-instance highlight intensity (0 or 1) */
  highlightData: Float32Array;
}

interface ModelPool {
  modelPath: string;
  lod0: LODPool | null;
  lod1: LODPool | null;
  lod2: LODPool | null;
  depleted: LODPool | null;
  instances: Map<string, TreeSlot>;
  yOffset: number;
  depletedYOffset: number;
  /** Unscaled model height from bounding box */
  modelHeight: number;
  /** Unscaled model horizontal radius from bounding box */
  modelRadius: number;
}

const resourceLOD = getLODDistances("resource");

// ---- Module state ----
let scene: THREE.Scene | null = null;
let world: World | null = null;
const pools = new Map<string, ModelPool>();
const entityToModel = new Map<string, string>();

function inferLOD1Path(lod0Path: string): string {
  return lod0Path.replace(/\.glb$/i, "_lod1.glb");
}
function inferLOD2Path(lod0Path: string): string {
  return lod0Path.replace(/\.glb$/i, "_lod2.glb");
}

// ---- Geometry extraction (portfolio pattern: reference, not clone) ----

interface MeshPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

function extractAllMeshParts(root: THREE.Object3D): MeshPart[] {
  const parts: MeshPart[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      if (Array.isArray(child.material)) {
        for (const mat of child.material) {
          parts.push({ geometry: child.geometry, material: mat });
        }
      } else {
        parts.push({ geometry: child.geometry, material: child.material });
      }
    }
  });
  return parts;
}

function createSharedGeometry(
  source: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  for (const name in source.attributes) {
    geo.setAttribute(name, source.attributes[name]);
  }
  if (source.index) geo.setIndex(source.index);
  if (source.morphAttributes) {
    for (const name in source.morphAttributes) {
      geo.morphAttributes[name] = source.morphAttributes[name];
    }
  }
  if (source.groups.length > 0) {
    for (const group of source.groups) {
      geo.addGroup(group.start, group.count, group.materialIndex);
    }
  }
  if (source.boundingBox) geo.boundingBox = source.boundingBox.clone();
  if (source.boundingSphere) geo.boundingSphere = source.boundingSphere.clone();
  return geo;
}

function computeModelBounds(
  root: THREE.Object3D,
  scale: number,
): {
  yOffset: number;
  height: number;
  radius: number;
} {
  const saved = root.scale.clone();
  root.scale.set(scale, scale, scale);
  const bbox = new THREE.Box3().setFromObject(root);
  root.scale.copy(saved);
  const height = bbox.max.y - bbox.min.y;
  const dx = Math.max(Math.abs(bbox.min.x), Math.abs(bbox.max.x));
  const dz = Math.max(Math.abs(bbox.min.z), Math.abs(bbox.max.z));
  return { yOffset: -bbox.min.y, height, radius: Math.max(dx, dz) };
}

// ---- LODPool creation ----

function createLODPool(
  parts: { geometry: THREE.BufferGeometry; material: DissolveMaterial }[],
): LODPool {
  const meshes: THREE.InstancedMesh[] = [];
  const materials: DissolveMaterial[] = [];
  const hlData = new Float32Array(MAX_INSTANCES);
  for (const part of parts) {
    const geo = createSharedGeometry(part.geometry);

    const hlAttr = new THREE.InstancedBufferAttribute(hlData, 1);
    hlAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("instanceHighlight", hlAttr);

    const im = new THREE.InstancedMesh(geo, part.material, MAX_INSTANCES);
    im.count = 0;
    im.frustumCulled = false;
    im.castShadow = true;
    im.receiveShadow = false;
    im.layers.set(1);
    scene!.add(im);
    meshes.push(im);
    materials.push(part.material);
  }
  return {
    meshes,
    materials,
    slots: new Map(),
    activeCount: 0,
    dirty: false,
    highlightData: hlData,
  };
}

async function loadLODParts(path: string): Promise<MeshPart[] | null> {
  try {
    const { scene: lodScene } = await modelCache.loadModel(path, world!);
    const parts = extractAllMeshParts(lodScene);
    return parts.length > 0 ? parts : null;
  } catch {
    return null;
  }
}

// ---- Model pool lifecycle ----

const pendingEnsure = new Map<string, Promise<ModelPool>>();

function enableTextureRepeat(mat: DissolveMaterial): void {
  const texProps = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "emissiveMap",
    "alphaMap",
  ] as const;
  for (const key of texProps) {
    const tex = (mat as unknown as Record<string, unknown>)[key] as
      | THREE.Texture
      | undefined;
    if (tex) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
    }
  }
}

async function ensureModelPool(
  modelPath: string,
  depletedModelPath?: string | null,
): Promise<ModelPool> {
  const existing = pools.get(modelPath);
  if (existing) {
    if (depletedModelPath && !existing.depleted) {
      await loadDepletedPool(existing, depletedModelPath);
    }
    return existing;
  }

  const pending = pendingEnsure.get(modelPath);
  if (pending) return pending;

  const promise = (async (): Promise<ModelPool> => {
    const dissolveOpts = {
      fadeStart: GPU_VEG_CONFIG.FADE_START,
      fadeEnd: GPU_VEG_CONFIG.FADE_END,
      enableNearFade: false,
      enableWaterCulling: false,
      enableOcclusionDissolve: false,
      enableRimHighlight: true,
    };

    function buildTreeParts(
      parts: MeshPart[],
    ): { geometry: THREE.BufferGeometry; material: DissolveMaterial }[] {
      return parts.map((p) => {
        const dm = createTreeDissolveMaterial(p.material, dissolveOpts);
        dm.side = THREE.DoubleSide;
        enableTextureRepeat(dm);
        world!.setupMaterial(dm);
        return { geometry: p.geometry, material: dm };
      });
    }

    // LOD0
    const { scene: lod0Scene } = await modelCache.loadModel(modelPath, world!);
    const lod0Parts = extractAllMeshParts(lod0Scene);
    if (lod0Parts.length === 0)
      throw new Error(`No mesh found in ${modelPath}`);

    const bounds = computeModelBounds(lod0Scene, 1);

    const lod0Pool = createLODPool(buildTreeParts(lod0Parts));

    // LOD1
    let lod1Pool: LODPool | null = null;
    const lod1Parts = await loadLODParts(inferLOD1Path(modelPath));
    if (lod1Parts) {
      lod1Pool = createLODPool(buildTreeParts(lod1Parts));
    }

    // LOD2
    let lod2Pool: LODPool | null = null;
    const lod2Parts = await loadLODParts(inferLOD2Path(modelPath));
    if (lod2Parts) {
      lod2Pool = createLODPool(buildTreeParts(lod2Parts));
    }

    const pool: ModelPool = {
      modelPath,
      lod0: lod0Pool,
      lod1: lod1Pool,
      lod2: lod2Pool,
      depleted: null,
      instances: new Map(),
      yOffset: bounds.yOffset,
      depletedYOffset: 0,
      modelHeight: bounds.height,
      modelRadius: bounds.radius,
    };
    pools.set(modelPath, pool);

    if (depletedModelPath) {
      await loadDepletedPool(pool, depletedModelPath);
    }

    return pool;
  })();

  pendingEnsure.set(modelPath, promise);
  try {
    return await promise;
  } finally {
    pendingEnsure.delete(modelPath);
  }
}

async function loadDepletedPool(
  pool: ModelPool,
  depletedModelPath: string,
): Promise<void> {
  if (pool.depleted) return;
  const depletedParts = await loadLODParts(depletedModelPath);
  if (!depletedParts) return;

  let depletedYOffset = 0;
  try {
    const { scene: depScene } = await modelCache.loadModel(
      depletedModelPath,
      world!,
    );
    depletedYOffset = computeModelBounds(depScene, 1).yOffset;
  } catch {
    /* use 0 */
  }

  const dissolveOpts = {
    fadeStart: GPU_VEG_CONFIG.FADE_START,
    fadeEnd: GPU_VEG_CONFIG.FADE_END,
    enableNearFade: false,
    enableWaterCulling: false,
    enableOcclusionDissolve: false,
    enableRimHighlight: true,
  };
  const depletedDissolveParts = depletedParts.map((p) => {
    const dm = createTreeDissolveMaterial(p.material, dissolveOpts);
    dm.side = THREE.DoubleSide;
    enableTextureRepeat(dm);
    world!.setupMaterial(dm);
    return { geometry: p.geometry, material: dm };
  });
  pool.depleted = createLODPool(depletedDissolveParts);
  pool.depletedYOffset = depletedYOffset;
}

// ---- Instance matrix helper ----

function composeInstanceMatrix(
  position: THREE.Vector3,
  rotation: number,
  scale: number,
  yOffset: number,
): THREE.Matrix4 {
  _position.set(position.x, position.y + yOffset * scale, position.z);
  _quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotation);
  _scale.set(scale, scale, scale);
  return _matrix.compose(_position, _quaternion, _scale);
}

function addToPool(pool: LODPool, entityId: string, mat: THREE.Matrix4): void {
  const idx = pool.activeCount;
  for (const im of pool.meshes) {
    im.setMatrixAt(idx, mat);
    im.count = idx + 1;
  }
  pool.slots.set(entityId, idx);
  pool.activeCount++;
  pool.dirty = true;
}

function removeFromPool(pool: LODPool, entityId: string): void {
  const idx = pool.slots.get(entityId);
  if (idx === undefined) return;

  const lastIdx = pool.activeCount - 1;
  if (idx !== lastIdx) {
    for (const im of pool.meshes) {
      im.getMatrixAt(lastIdx, _swapMatrix);
      im.setMatrixAt(idx, _swapMatrix);
    }
    pool.highlightData[idx] = pool.highlightData[lastIdx];

    for (const [eid, eidIdx] of pool.slots) {
      if (eidIdx === lastIdx) {
        pool.slots.set(eid, idx);
        break;
      }
    }
  }
  pool.highlightData[lastIdx] = 0;

  pool.slots.delete(entityId);
  pool.activeCount--;
  for (const im of pool.meshes) {
    im.count = pool.activeCount;
  }
  pool.dirty = true;
}

// ---- Public API ----

export function initGLBTreeInstancer(s: THREE.Scene, w: World): void {
  scene = s;
  world = w;
}

export function destroyGLBTreeInstancer(): void {
  for (const pool of pools.values()) {
    for (const lodPool of [pool.lod0, pool.lod1, pool.lod2, pool.depleted]) {
      if (!lodPool) continue;
      for (const im of lodPool.meshes) {
        scene?.remove(im);
        im.geometry.dispose();
      }
      for (const mat of lodPool.materials) mat.dispose();
    }
  }
  pools.clear();
  entityToModel.clear();
  pendingEnsure.clear();
  scene = null;
  world = null;
}

export async function addInstance(
  modelPath: string,
  entityId: string,
  position: THREE.Vector3,
  rotation: number,
  scale: number,
  depletedModelPath?: string | null,
  depletedScale?: number,
): Promise<boolean> {
  if (!scene || !world) return false;

  try {
    const pool = await ensureModelPool(modelPath, depletedModelPath);

    if (pool.lod0 && pool.lod0.activeCount >= MAX_INSTANCES) {
      console.warn(
        `[GLBTreeInstancer] LOD0 pool full for ${modelPath}, cannot add ${entityId}`,
      );
      return false;
    }

    const slot: TreeSlot = {
      entityId,
      position: position.clone(),
      rotation,
      scale,
      depletedScale: depletedScale ?? scale,
      yOffset: pool.yOffset,
      currentLOD: 0,
      depleted: false,
    };

    pool.instances.set(entityId, slot);
    entityToModel.set(entityId, modelPath);

    const mat = composeInstanceMatrix(position, rotation, scale, pool.yOffset);
    addToPool(pool.lod0!, entityId, mat);

    return true;
  } catch (error) {
    console.warn(
      `[GLBTreeInstancer] Failed to add instance ${entityId}:`,
      error,
    );
    return false;
  }
}

export function removeInstance(entityId: string): void {
  const modelPath = entityToModel.get(entityId);
  if (!modelPath) return;

  const pool = pools.get(modelPath);
  if (!pool) return;

  const slot = pool.instances.get(entityId);
  if (!slot) return;

  const lodPool =
    slot.currentLOD === 0
      ? pool.lod0
      : slot.currentLOD === 1
        ? pool.lod1
        : pool.lod2;
  if (lodPool) removeFromPool(lodPool, entityId);

  pool.instances.delete(entityId);
  entityToModel.delete(entityId);
}

export function setDepleted(entityId: string, depleted: boolean): void {
  const modelPath = entityToModel.get(entityId);
  if (!modelPath) return;

  const pool = pools.get(modelPath);
  if (!pool) return;

  const slot = pool.instances.get(entityId);
  if (!slot || slot.depleted === depleted) return;

  slot.depleted = depleted;

  if (depleted) {
    // Remove from living LOD pool
    const lodPool =
      slot.currentLOD === 0
        ? pool.lod0
        : slot.currentLOD === 1
          ? pool.lod1
          : pool.lod2;
    if (lodPool) removeFromPool(lodPool, entityId);

    // Add to depleted pool (instanced stump)
    if (pool.depleted) {
      const mat = composeInstanceMatrix(
        slot.position,
        slot.rotation,
        slot.depletedScale,
        pool.depletedYOffset,
      );
      addToPool(pool.depleted, entityId, mat);
    }
  } else {
    // Remove from depleted pool
    if (pool.depleted) {
      removeFromPool(pool.depleted, entityId);
    }

    // Re-add to living LOD pool
    const mat = composeInstanceMatrix(
      slot.position,
      slot.rotation,
      slot.scale,
      slot.yOffset,
    );
    const lodPool =
      slot.currentLOD === 0
        ? pool.lod0
        : slot.currentLOD === 1
          ? pool.lod1
          : pool.lod2;
    if (lodPool) addToPool(lodPool, entityId, mat);
  }
}

export function hasInstance(entityId: string): boolean {
  return entityToModel.has(entityId);
}

/**
 * Returns the unscaled model dimensions for an instanced entity.
 * Used to size collision proxies to match the actual model.
 */
export function getModelDimensions(
  entityId: string,
): { height: number; radius: number } | null {
  const modelPath = entityToModel.get(entityId);
  if (!modelPath) return null;
  const pool = pools.get(modelPath);
  if (!pool) return null;
  return { height: pool.modelHeight, radius: pool.modelRadius };
}

/**
 * Returns true if the instancer has a depleted pool for this entity's model.
 * When true, ResourceEntity can skip loading an individual depleted model.
 */
export function hasDepleted(entityId: string): boolean {
  const modelPath = entityToModel.get(entityId);
  if (!modelPath) return false;
  const pool = pools.get(modelPath);
  return !!pool?.depleted;
}

/** Track which entity is currently highlighted so we can clear it */
let highlightedEntityId: string | null = null;

/**
 * Set or clear shader-based rim highlight for an instanced tree entity.
 * Sets the per-instance `instanceHighlight` attribute to 1 or 0.
 */
export function setHighlight(entityId: string, on: boolean): void {
  if (on && highlightedEntityId && highlightedEntityId !== entityId) {
    setHighlight(highlightedEntityId, false);
  }

  const modelPath = entityToModel.get(entityId);
  if (!modelPath) return;

  const pool = pools.get(modelPath);
  if (!pool) return;

  const slot = pool.instances.get(entityId);
  if (!slot) return;

  const lodPool = slot.depleted
    ? pool.depleted
    : slot.currentLOD === 0
      ? pool.lod0
      : slot.currentLOD === 1
        ? pool.lod1
        : pool.lod2;
  if (!lodPool) return;

  const idx = lodPool.slots.get(entityId);
  if (idx === undefined) return;

  const value = on ? 1.0 : 0.0;
  lodPool.highlightData[idx] = value;
  for (const im of lodPool.meshes) {
    const attr = im.geometry.getAttribute("instanceHighlight");
    if (attr) {
      (attr as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
  }

  highlightedEntityId = on ? entityId : null;
}

/**
 * Clear any active shader highlight (e.g. when hover leaves all entities).
 */
export function clearHighlight(): void {
  if (highlightedEntityId) {
    setHighlight(highlightedEntityId, false);
  }
}

let lastUpdateFrame = -1;

export function updateGLBTreeInstancer(): void {
  if (!world) return;
  if (world.frame === lastUpdateFrame) return;
  lastUpdateFrame = world.frame;

  const camera = world.camera;
  if (!camera) return;

  const camPos = camera.position;
  const lod1DistSq = resourceLOD.lod1DistanceSq;
  const lod2DistSq = resourceLOD.lod2DistanceSq;
  const hysteresisSq = 0.81; // 0.9^2

  for (const pool of pools.values()) {
    for (const slot of pool.instances.values()) {
      if (slot.depleted) continue;

      const dx = camPos.x - slot.position.x;
      const dz = camPos.z - slot.position.z;
      const distSq = dx * dx + dz * dz;

      let targetLOD: 0 | 1 | 2;
      if (distSq < lod1DistSq * hysteresisSq) {
        targetLOD = 0;
      } else if (distSq < lod1DistSq) {
        targetLOD = slot.currentLOD === 0 ? 0 : pool.lod1 ? 1 : 0;
      } else if (distSq < lod2DistSq * hysteresisSq) {
        targetLOD = pool.lod1 ? 1 : 0;
      } else if (distSq < lod2DistSq) {
        if (slot.currentLOD <= 1) {
          targetLOD = pool.lod1 ? 1 : 0;
        } else {
          targetLOD = pool.lod2 ? 2 : pool.lod1 ? 1 : 0;
        }
      } else {
        targetLOD = pool.lod2 ? 2 : pool.lod1 ? 1 : 0;
      }

      if (targetLOD === slot.currentLOD) continue;

      // Move instance between LOD pools
      const oldPool =
        slot.currentLOD === 0
          ? pool.lod0
          : slot.currentLOD === 1
            ? pool.lod1
            : pool.lod2;
      const newPool =
        targetLOD === 0 ? pool.lod0 : targetLOD === 1 ? pool.lod1 : pool.lod2;

      const wasHighlighted =
        oldPool && oldPool.slots.has(slot.entityId)
          ? oldPool.highlightData[oldPool.slots.get(slot.entityId)!]
          : 0;
      if (oldPool) removeFromPool(oldPool, slot.entityId);
      if (newPool) {
        const mat = composeInstanceMatrix(
          slot.position,
          slot.rotation,
          slot.scale,
          slot.yOffset,
        );
        addToPool(newPool, slot.entityId, mat);
        if (wasHighlighted > 0) {
          const newIdx = newPool.slots.get(slot.entityId);
          if (newIdx !== undefined) {
            newPool.highlightData[newIdx] = wasHighlighted;
            for (const im of newPool.meshes) {
              const attr = im.geometry.getAttribute("instanceHighlight");
              if (attr)
                (attr as THREE.InstancedBufferAttribute).needsUpdate = true;
            }
          }
        }
      }
      slot.currentLOD = targetLOD;
    }
  }

  // Flush dirty pools + update dissolve uniforms
  const camY = camPos.y;
  const players = world.getPlayers();
  const localPlayer = players && players.length > 0 ? players[0] : null;
  const playerPos = localPlayer?.node?.position ?? camPos;

  // Get sun direction from Environment system
  const env = world.getSystem("environment") as {
    sunLight?: { intensity: number };
    lightDirection?: THREE.Vector3;
    hemisphereLight?: { color: THREE.Color };
  } | null;

  for (const pool of pools.values()) {
    for (const lodPool of [pool.lod0, pool.lod1, pool.lod2, pool.depleted]) {
      if (!lodPool) continue;

      if (lodPool.dirty) {
        for (const im of lodPool.meshes) {
          im.instanceMatrix.needsUpdate = true;
        }
        lodPool.dirty = false;
      }

      for (const mat of lodPool.materials) {
        mat.dissolveUniforms.cameraPos.value.set(camPos.x, camY, camPos.z);
        mat.dissolveUniforms.playerPos.value.set(
          playerPos.x,
          playerPos.y,
          playerPos.z,
        );

        // Sync tree-specific uniforms (sun direction, intensity, shade color)
        const treeMat = mat as TreeDissolveMaterial;
        if (treeMat.treeUniforms) {
          if (env?.lightDirection) {
            treeMat.treeUniforms.sunDirection.value
              .copy(env.lightDirection)
              .negate();
          }
          if (env?.sunLight) {
            treeMat.treeUniforms.sunIntensity.value = Math.min(
              env.sunLight.intensity,
              2.0,
            );
          }
          if (env?.hemisphereLight) {
            const c = env.hemisphereLight.color;
            const avg = (c.r + c.g + c.b) / 3;
            if (avg > 0.01) {
              treeMat.treeUniforms.shadeColor.value.setRGB(
                c.r / avg,
                c.g / avg,
                c.b / avg,
              );
            }
          }
        }
      }
    }
  }
}
