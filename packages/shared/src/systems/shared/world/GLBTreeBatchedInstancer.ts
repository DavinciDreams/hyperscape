/**
 * GLBTreeBatchedInstancer — BatchedMesh-based rendering for multi-variant trees.
 *
 * Loads all model variants for each tree type once, registers their
 * geometries in a shared BatchedMesh per material slot per LOD level.
 * Each tree instance picks a variant via addInstance(geometryId).
 *
 * One BatchedMesh per material slot (bark, leaves) per LOD = minimal
 * draw calls regardless of how many variants a tree type has.
 *
 * Used when a tree type has `modelVariants` in its manifest.
 * For single-model resources, use GLBTreeInstancer (InstancedMesh-based).
 *
 * @module GLBTreeBatchedInstancer
 */

import THREE from "../../../extras/three/three";
import type { World } from "../../../core/World";
import { modelCache } from "../../../utils/rendering/ModelCache";
import {
  createTreeDissolveMaterial,
  GPU_VEG_CONFIG,
  type DissolveMaterial,
  type TreeDissolveMaterial,
  type TreeMaterialOptions,
} from "./GPUMaterials";
import type { Wind } from "./Wind";
import { getLODDistances, inferLOD1Path, inferLOD2Path } from "./LODConfig";

const MAX_INSTANCES = 512;

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();

const _defaultColor = new THREE.Color(1, 1, 1);
const _hlColor = new THREE.Color(1.15, 1.15, 1.15);

interface TreeSlot {
  entityId: string;
  position: THREE.Vector3;
  rotation: number;
  scale: number;
  depletedScale: number;
  yOffset: number;
  currentLOD: 0 | 1 | 2;
  depleted: boolean;
  variantIndex: number;
}

interface BatchedLODPool {
  /** One BatchedMesh per material slot (e.g. [bark, leaves]) */
  batches: THREE.BatchedMesh[];
  materials: DissolveMaterial[];
  /**
   * geometryIds[materialSlot][variantIndex] = geometryId returned by
   * BatchedMesh.addGeometry() for that variant's geometry.
   */
  geometryIds: number[][];
  /** entityId → array of instanceIds (one per BatchedMesh/material slot) */
  instanceIds: Map<string, number[]>;
  /**
   * sourceGeometries[variantIndex][materialSlot] = original BufferGeometry.
   * Retained so collision proxies can use the actual model shape.
   */
  sourceGeometries: THREE.BufferGeometry[][];
}

interface TreeTypePool {
  treeType: string;
  variantPaths: string[];
  lod0: BatchedLODPool | null;
  lod1: BatchedLODPool | null;
  lod2: BatchedLODPool | null;
  depleted: BatchedLODPool | null;
  instances: Map<string, TreeSlot>;
  yOffset: number;
  depletedYOffset: number;
  modelHeight: number;
  modelRadius: number;
}

const resourceLOD = getLODDistances("resource");

// ---- Module state ----
let scene: THREE.Scene | null = null;
let world: World | null = null;
const pools = new Map<string, TreeTypePool>();
const entityToTreeType = new Map<string, string>();

// ---- Geometry extraction ----

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

let _fingerprintId = 0;

/**
 * Returns a string key that identifies a material's diffuse texture.
 * Used to match the same material slot across different model variants.
 */
function getTextureFingerprint(mat: THREE.Material): string {
  const std = mat as THREE.MeshStandardMaterial;
  if (std.map?.image) {
    const img = std.map.image as {
      width?: number;
      height?: number;
      src?: string;
      uuid?: string;
    };
    return `tex:${img.width}x${img.height}:${img.src ?? img.uuid ?? ""}`;
  }
  if (std.name) return `name:${std.name}`;
  // Deterministic fallback — monotonic counter avoids random fingerprints
  // that would silently prevent variant matching.
  return `idx:${_fingerprintId++}`;
}

/**
 * Reorder `parts` so that each part's texture fingerprint matches
 * the corresponding `refFingerprints[slotIdx]`.
 * Returns reordered array, or null if matching fails.
 */
function matchPartsToReference(
  refFingerprints: string[],
  parts: MeshPart[],
): MeshPart[] | null {
  if (parts.length !== refFingerprints.length) return null;
  const partFingerprints = parts.map((p) => getTextureFingerprint(p.material));
  const used = new Set<number>();
  const reordered: MeshPart[] = [];

  for (let slot = 0; slot < refFingerprints.length; slot++) {
    let matched = -1;
    for (let pi = 0; pi < partFingerprints.length; pi++) {
      if (!used.has(pi) && partFingerprints[pi] === refFingerprints[slot]) {
        matched = pi;
        break;
      }
    }
    if (matched === -1) {
      // Fallback: try matching by material name
      const refName = refFingerprints[slot].startsWith("name:")
        ? refFingerprints[slot].slice(5)
        : "";
      for (let pi = 0; pi < parts.length; pi++) {
        if (
          !used.has(pi) &&
          (parts[pi].material as THREE.MeshStandardMaterial).name === refName
        ) {
          matched = pi;
          break;
        }
      }
    }
    if (matched === -1) return null;
    used.add(matched);
    reordered.push(parts[matched]);
  }
  return reordered;
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

async function loadLODParts(path: string): Promise<MeshPart[] | null> {
  try {
    const { scene: lodScene } = await modelCache.loadModel(path, world!);
    const parts = extractAllMeshParts(lodScene);
    return parts.length > 0 ? parts : null;
  } catch {
    return null;
  }
}

// ---- BatchedLODPool creation ----

function countGeometry(geo: THREE.BufferGeometry): {
  vertexCount: number;
  indexCount: number;
} {
  const vertexCount = geo.getAttribute("position")?.count ?? 0;
  const indexCount = geo.index?.count ?? 0;
  return { vertexCount, indexCount };
}

type AttributeTemplate = {
  itemSize: number;
  normalized: boolean;
  arrayCtor: new (length: number) => ArrayLike<number>;
  gpuType?: number;
};

function collectAttributeTemplates(
  geometries: THREE.BufferGeometry[],
): Map<string, AttributeTemplate> {
  const templates = new Map<string, AttributeTemplate>();

  for (const geometry of geometries) {
    for (const name of Object.keys(geometry.attributes)) {
      if (templates.has(name)) continue;
      const attribute = geometry.getAttribute(name);
      if (!attribute) continue;

      templates.set(name, {
        itemSize: attribute.itemSize,
        normalized: attribute.normalized,
        arrayCtor: attribute.array.constructor as AttributeTemplate["arrayCtor"],
        gpuType:
          "gpuType" in attribute && typeof attribute.gpuType === "number"
            ? attribute.gpuType
            : undefined,
      });
    }
  }

  return templates;
}

function createMissingAttribute(
  vertexCount: number,
  template: AttributeTemplate,
): THREE.BufferAttribute {
  const array = new template.arrayCtor(vertexCount * template.itemSize) as
    | Float32Array
    | Uint32Array
    | Uint16Array
    | Uint8Array
    | Int32Array
    | Int16Array
    | Int8Array;
  const attribute = new THREE.BufferAttribute(
    array,
    template.itemSize,
    template.normalized,
  );
  if (typeof template.gpuType === "number") {
    attribute.gpuType = template.gpuType as typeof attribute.gpuType;
  }
  return attribute;
}

function normalizeBatchedSlotGeometries(
  treeType: string,
  variantPaths: string[],
  slot: number,
  geometries: THREE.BufferGeometry[],
): THREE.BufferGeometry[] {
  const templates = collectAttributeTemplates(geometries);

  return geometries.map((geometry, variantIndex) => {
    const positionCount = geometry.getAttribute("position")?.count ?? 0;
    if (positionCount === 0) {
      return geometry;
    }

    let clone: THREE.BufferGeometry | null = null;
    for (const [name, template] of templates) {
      const existing = geometry.getAttribute(name);
      if (existing) {
        continue;
      }
      if (!clone) {
        clone = geometry.clone();
      }
      clone.setAttribute(name, createMissingAttribute(positionCount, template));
      console.warn(
        `[GLBTreeBatchedInstancer] Normalized missing "${name}" attribute for ${treeType} slot ${slot} variant ${variantPaths[variantIndex]}`,
      );
    }

    return clone ?? geometry;
  });
}

/**
 * Build a BatchedLODPool from multiple variants' parts.
 * variantParts[variant][materialSlot] = { geometry, material }
 * All variants must have the same number of material slots.
 */
function createBatchedLODPool(
  treeType: string,
  variantPaths: string[],
  variantParts: {
    geometry: THREE.BufferGeometry;
    material: DissolveMaterial;
  }[][],
): BatchedLODPool {
  const numSlots = variantParts[0].length;
  const numVariants = variantParts.length;

  const batches: THREE.BatchedMesh[] = [];
  const materials: DissolveMaterial[] = [];
  const geometryIds: number[][] = [];

  for (let slot = 0; slot < numSlots; slot++) {
    const mat = variantParts[0][slot].material;
    const slotGeometries = normalizeBatchedSlotGeometries(
      treeType,
      variantPaths,
      slot,
      variantParts.map((parts) => parts[slot].geometry),
    );

    let totalVerts = 0;
    let totalIndices = 0;
    for (let v = 0; v < numVariants; v++) {
      const counts = countGeometry(slotGeometries[v]);
      totalVerts += counts.vertexCount;
      totalIndices += counts.indexCount;
    }

    const bm = new THREE.BatchedMesh(
      MAX_INSTANCES,
      totalVerts,
      totalIndices > 0 ? totalIndices : undefined,
      mat,
    );
    bm.frustumCulled = false;
    bm.perObjectFrustumCulled = false;
    bm.sortObjects = false;
    bm.castShadow = true;
    bm.receiveShadow = false;
    bm.layers.set(1);

    const slotGeoIds: number[] = [];
    for (let v = 0; v < numVariants; v++) {
      const geoId = bm.addGeometry(slotGeometries[v]);
      slotGeoIds.push(geoId);
    }

    // Force-init colors texture so BatchNode sets up vBatchColor varying
    // before the first shader compilation.
    const initId = bm.addInstance(slotGeoIds[0]);
    bm.setColorAt(initId, _defaultColor);
    bm.deleteInstance(initId);

    scene!.add(bm);
    batches.push(bm);
    materials.push(mat);
    geometryIds.push(slotGeoIds);
  }

  // Store source geometries per variant for collision proxy use
  const sourceGeometries: THREE.BufferGeometry[][] = [];
  for (let v = 0; v < numVariants; v++) {
    sourceGeometries.push(variantParts[v].map((p) => p.geometry));
  }

  return {
    batches,
    materials,
    geometryIds,
    instanceIds: new Map(),
    sourceGeometries,
  };
}

// ---- Texture helpers ----

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

// ---- Tree type pool lifecycle ----

const pendingEnsure = new Map<string, Promise<TreeTypePool>>();

async function ensureTreeTypePool(
  treeType: string,
  variantPaths: string[],
  depletedModelPath?: string | null,
): Promise<TreeTypePool> {
  const existing = pools.get(treeType);
  if (existing) {
    if (depletedModelPath && !existing.depleted) {
      await loadDepletedPool(existing, depletedModelPath);
    }
    return existing;
  }

  const pending = pendingEnsure.get(treeType);
  if (pending) return pending;

  const promise = (async (): Promise<TreeTypePool> => {
    const dissolveOpts = {
      fadeStart: GPU_VEG_CONFIG.FADE_START,
      fadeEnd: GPU_VEG_CONFIG.FADE_END,
      enableNearFade: false,
      enableWaterCulling: false,
      enableOcclusionDissolve: false,
      enableRimHighlight: true,
    };

    function buildMaterialForPart(p: MeshPart): DissolveMaterial {
      const isLeaf =
        !!(p.material as any).transparent ||
        (p.material as any).side === THREE.DoubleSide;
      const dm = createTreeDissolveMaterial(p.material, {
        ...dissolveOpts,
        batched: true,
        isLeafMaterial: isLeaf,
      } as TreeMaterialOptions);
      dm.side = THREE.DoubleSide;
      enableTextureRepeat(dm);
      world!.setupMaterial(dm);
      return dm;
    }

    // Load all variant LOD0s in parallel
    const lod0Scenes = await Promise.all(
      variantPaths.map(async (vp) => {
        const { scene: s } = await modelCache.loadModel(vp, world!);
        return s;
      }),
    );

    // Extract parts per variant
    const allLod0Parts = lod0Scenes.map((s) => extractAllMeshParts(s));
    if (allLod0Parts[0].length === 0)
      throw new Error(`No mesh found in ${variantPaths[0]}`);

    const numSlots = allLod0Parts[0].length;

    // Build a texture fingerprint for each part in variant 0 to define slot identity
    const refFingerprints = allLod0Parts[0].map((p) =>
      getTextureFingerprint(p.material),
    );

    // Reorder each subsequent variant's parts to match variant 0's slot order
    for (let v = 1; v < allLod0Parts.length; v++) {
      const parts = allLod0Parts[v];
      if (parts.length !== numSlots) {
        console.warn(
          `[GLBTreeBatchedInstancer] Variant ${variantPaths[v]} has ${parts.length} parts, expected ${numSlots}!`,
        );
        continue;
      }
      const reordered = matchPartsToReference(refFingerprints, parts);
      if (reordered) {
        allLod0Parts[v] = reordered;
      } else {
        console.warn(
          `[GLBTreeBatchedInstancer] Could not match parts for ${variantPaths[v]} — using original order`,
        );
      }
    }

    // Build materials from first variant (shared for all variants)
    const sharedMaterials = allLod0Parts[0].map((p) => buildMaterialForPart(p));

    // Build variant parts for LOD0
    const lod0VariantParts = allLod0Parts.map((parts) =>
      parts.map((p, slotIdx) => ({
        geometry: p.geometry,
        material: sharedMaterials[slotIdx % sharedMaterials.length],
      })),
    );

    const lod0Pool = createBatchedLODPool(treeType, variantPaths, lod0VariantParts);

    // Compute bounds from first variant
    const bounds = computeModelBounds(lod0Scenes[0], 1);

    // Load LOD1 variants in parallel
    let lod1Pool: BatchedLODPool | null = null;
    const lod1Results = await Promise.all(
      variantPaths.map((vp) => loadLODParts(inferLOD1Path(vp))),
    );
    const validLod1 = lod1Results.filter(
      (r): r is MeshPart[] => r !== null && r.length === numSlots,
    );
    if (validLod1.length > 0) {
      const lod1Ref = validLod1[0].map((p) =>
        getTextureFingerprint(p.material),
      );
      for (let v = 1; v < validLod1.length; v++) {
        const matched = matchPartsToReference(lod1Ref, validLod1[v]);
        if (matched) validLod1[v] = matched;
      }
      const lod1Materials = validLod1[0].map((p) => buildMaterialForPart(p));
      const lod1VariantParts = validLod1.map((parts) =>
        parts.map((p, slotIdx) => ({
          geometry: p.geometry,
          material: lod1Materials[slotIdx],
        })),
      );
      lod1Pool = createBatchedLODPool(treeType, variantPaths, lod1VariantParts);
    }

    // Load LOD2 variants in parallel
    let lod2Pool: BatchedLODPool | null = null;
    const lod2Results = await Promise.all(
      variantPaths.map((vp) => loadLODParts(inferLOD2Path(vp))),
    );
    const validLod2 = lod2Results.filter(
      (r): r is MeshPart[] => r !== null && r.length === numSlots,
    );
    if (validLod2.length > 0) {
      const lod2Ref = validLod2[0].map((p) =>
        getTextureFingerprint(p.material),
      );
      for (let v = 1; v < validLod2.length; v++) {
        const matched = matchPartsToReference(lod2Ref, validLod2[v]);
        if (matched) validLod2[v] = matched;
      }
      const lod2Materials = validLod2[0].map((p) => buildMaterialForPart(p));
      const lod2VariantParts = validLod2.map((parts) =>
        parts.map((p, slotIdx) => ({
          geometry: p.geometry,
          material: lod2Materials[slotIdx],
        })),
      );
      lod2Pool = createBatchedLODPool(treeType, variantPaths, lod2VariantParts);
    }

    const pool: TreeTypePool = {
      treeType,
      variantPaths,
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
    pools.set(treeType, pool);

    if (depletedModelPath) {
      await loadDepletedPool(pool, depletedModelPath);
    }

    return pool;
  })();

  pendingEnsure.set(treeType, promise);
  try {
    return await promise;
  } finally {
    pendingEnsure.delete(treeType);
  }
}

async function loadDepletedPool(
  pool: TreeTypePool,
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
    const dm = createTreeDissolveMaterial(p.material, {
      ...dissolveOpts,
      batched: true,
    });
    dm.side = THREE.DoubleSide;
    enableTextureRepeat(dm);
    world!.setupMaterial(dm);
    return [{ geometry: p.geometry, material: dm }];
  });

  // Depleted has 1 "variant" (the stump)
  // Transpose: depletedDissolveParts is [slot][1 variant] but we need [1 variant][slot]
  const numSlots = depletedParts.length;
  const singleVariant: {
    geometry: THREE.BufferGeometry;
    material: DissolveMaterial;
  }[] = [];
  for (let s = 0; s < numSlots; s++) {
    singleVariant.push(depletedDissolveParts[s][0]);
  }
  pool.depleted = createBatchedLODPool(
    pool.treeType,
    [depletedModelPath],
    [singleVariant],
  );
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

// ---- Pool add/remove ----

function addToPool(
  pool: BatchedLODPool,
  entityId: string,
  mat: THREE.Matrix4,
  variantIndex: number,
): void {
  const ids: number[] = [];
  for (let i = 0; i < pool.batches.length; i++) {
    const numVariants = pool.geometryIds[i].length;
    const clampedIdx = variantIndex % numVariants;
    const geoId = pool.geometryIds[i][clampedIdx];
    if (geoId === undefined) {
      console.warn(
        `[GLBTreeBatchedInstancer] geoId undefined: slot=${i} variant=${clampedIdx} available=${numVariants}`,
      );
      continue;
    }
    const instId = pool.batches[i].addInstance(geoId);
    pool.batches[i].setMatrixAt(instId, mat);
    pool.batches[i].setColorAt(instId, _defaultColor);
    ids.push(instId);
  }
  pool.instanceIds.set(entityId, ids);
}

function removeFromPool(pool: BatchedLODPool, entityId: string): void {
  const ids = pool.instanceIds.get(entityId);
  if (!ids) return;
  for (let i = 0; i < pool.batches.length; i++) {
    pool.batches[i].deleteInstance(ids[i]);
  }
  pool.instanceIds.delete(entityId);
}

const _tmpColor = new THREE.Color();

function isHighlighted(pool: BatchedLODPool, entityId: string): boolean {
  const ids = pool.instanceIds.get(entityId);
  if (!ids || ids.length === 0) return false;
  pool.batches[0].getColorAt(ids[0], _tmpColor);
  return _tmpColor.r > 1.01;
}

function applyHighlightColor(
  pool: BatchedLODPool,
  entityId: string,
  on: boolean,
): void {
  const ids = pool.instanceIds.get(entityId);
  if (!ids) return;
  const color = on ? _hlColor : _defaultColor;
  for (let i = 0; i < pool.batches.length; i++) {
    pool.batches[i].setColorAt(ids[i], color);
  }
}

// ---- Public API ----

export function initGLBTreeBatchedInstancer(s: THREE.Scene, w: World): void {
  scene = s;
  world = w;
}

/**
 * NOTE: Caller must also call clearProxyGeometryCache() (from TreeGLBVisualStrategy)
 * after this to dispose cached proxy geometries that reference sourceGeometries.
 */
export function destroyGLBTreeBatchedInstancer(): void {
  for (const pool of pools.values()) {
    for (const lodPool of [pool.lod0, pool.lod1, pool.lod2, pool.depleted]) {
      if (!lodPool) continue;
      for (const bm of lodPool.batches) {
        scene?.remove(bm);
        bm.dispose();
      }
      for (const mat of lodPool.materials) mat.dispose();
      lodPool.sourceGeometries.length = 0;
    }
  }
  pools.clear();
  entityToTreeType.clear();
  pendingEnsure.clear();
  scene = null;
  world = null;
}

export async function addInstance(
  treeType: string,
  variantPaths: string[],
  variantIndex: number,
  entityId: string,
  position: THREE.Vector3,
  rotation: number,
  scale: number,
  depletedModelPath?: string | null,
  depletedScale?: number,
): Promise<boolean> {
  if (!scene || !world) return false;

  try {
    const pool = await ensureTreeTypePool(
      treeType,
      variantPaths,
      depletedModelPath,
    );

    const slot: TreeSlot = {
      entityId,
      position: position.clone(),
      rotation,
      scale,
      depletedScale: depletedScale ?? scale,
      yOffset: pool.yOffset,
      currentLOD: 0,
      depleted: false,
      variantIndex,
    };

    pool.instances.set(entityId, slot);
    entityToTreeType.set(entityId, treeType);

    const mat = composeInstanceMatrix(position, rotation, scale, pool.yOffset);
    if (pool.lod0) addToPool(pool.lod0, entityId, mat, variantIndex);

    return true;
  } catch (error) {
    console.warn(
      `[GLBTreeBatchedInstancer] Failed to add instance ${entityId}:`,
      error,
    );
    return false;
  }
}

export function removeInstance(entityId: string): void {
  const treeType = entityToTreeType.get(entityId);
  if (!treeType) return;

  const pool = pools.get(treeType);
  if (!pool) return;

  const slot = pool.instances.get(entityId);
  if (!slot) return;

  const lodPool = getLodPool(pool, slot);
  if (lodPool) removeFromPool(lodPool, entityId);

  pool.instances.delete(entityId);
  entityToTreeType.delete(entityId);
}

function getLodPool(pool: TreeTypePool, slot: TreeSlot): BatchedLODPool | null {
  if (slot.depleted) return pool.depleted;
  return slot.currentLOD === 0
    ? pool.lod0
    : slot.currentLOD === 1
      ? pool.lod1
      : pool.lod2;
}

export function setDepleted(entityId: string, depleted: boolean): void {
  const treeType = entityToTreeType.get(entityId);
  if (!treeType) return;

  const pool = pools.get(treeType);
  if (!pool) return;

  const slot = pool.instances.get(entityId);
  if (!slot || slot.depleted === depleted) return;

  slot.depleted = depleted;

  if (depleted) {
    const lodPool = getLodPool(pool, slot);
    if (lodPool) removeFromPool(lodPool, entityId);

    if (pool.depleted) {
      const mat = composeInstanceMatrix(
        slot.position,
        slot.rotation,
        slot.depletedScale,
        pool.depletedYOffset,
      );
      addToPool(pool.depleted, entityId, mat, 0);
    }
  } else {
    if (pool.depleted) {
      removeFromPool(pool.depleted, entityId);
    }

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
    if (lodPool) addToPool(lodPool, entityId, mat, slot.variantIndex);
  }
}

export function hasInstance(entityId: string): boolean {
  return entityToTreeType.has(entityId);
}

export function getModelDimensions(
  entityId: string,
): { height: number; radius: number } | null {
  const treeType = entityToTreeType.get(entityId);
  if (!treeType) return null;
  const pool = pools.get(treeType);
  if (!pool) return null;
  return { height: pool.modelHeight, radius: pool.modelRadius };
}

/**
 * Returns the lowest-available LOD geometries for use as a collision proxy,
 * plus the yOffset needed to align the geometry with the visual instance.
 * Prefers LOD2 → LOD1 → LOD0, using the entity's assigned variant.
 * Returns null if the entity isn't registered.
 *
 * **Important**: Returned geometries are shared by the instancer pool.
 * Callers MUST clone before mutating (e.g. scaling).
 */
export function getProxyGeometry(
  entityId: string,
): { geometries: THREE.BufferGeometry[]; yOffset: number } | null {
  const treeType = entityToTreeType.get(entityId);
  if (!treeType) return null;
  const pool = pools.get(treeType);
  if (!pool) return null;
  const slot = pool.instances.get(entityId);
  if (!slot) return null;
  const lodPool = pool.lod2 ?? pool.lod1 ?? pool.lod0;
  if (!lodPool) return null;
  const vi = slot.variantIndex % lodPool.sourceGeometries.length;
  return {
    geometries: lodPool.sourceGeometries[vi],
    yOffset: pool.yOffset,
  };
}

export function hasDepleted(entityId: string): boolean {
  const treeType = entityToTreeType.get(entityId);
  if (!treeType) return false;
  const pool = pools.get(treeType);
  return !!pool?.depleted;
}

let highlightedEntityId: string | null = null;

export function setHighlight(entityId: string, on: boolean): void {
  if (on && highlightedEntityId && highlightedEntityId !== entityId) {
    setHighlight(highlightedEntityId, false);
  }

  const treeType = entityToTreeType.get(entityId);
  if (!treeType) return;

  const pool = pools.get(treeType);
  if (!pool) return;

  const slot = pool.instances.get(entityId);
  if (!slot) return;

  const lodPool = getLodPool(pool, slot);
  if (!lodPool) return;

  applyHighlightColor(lodPool, entityId, on);
  highlightedEntityId = on ? entityId : null;
}

export function clearHighlight(): void {
  if (highlightedEntityId) {
    setHighlight(highlightedEntityId, false);
  }
}

let lastUpdateFrame = -1;

export function updateGLBTreeBatchedInstancer(): void {
  if (!world) return;
  if (world.frame === lastUpdateFrame) return;
  lastUpdateFrame = world.frame;

  const camera = world.camera;
  if (!camera) return;

  const camPos = camera.position;
  const lod1DistSq = resourceLOD.lod1DistanceSq;
  const lod2DistSq = resourceLOD.lod2DistanceSq;
  const hysteresisSq = 0.81;

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

      const oldPool = getLodPool(pool, slot);
      const wasHl = oldPool ? isHighlighted(oldPool, slot.entityId) : false;
      if (oldPool) removeFromPool(oldPool, slot.entityId);

      slot.currentLOD = targetLOD;

      const newPool = getLodPool(pool, slot);
      if (newPool) {
        const mat = composeInstanceMatrix(
          slot.position,
          slot.rotation,
          slot.scale,
          slot.yOffset,
        );
        addToPool(newPool, slot.entityId, mat, slot.variantIndex);
        if (wasHl) applyHighlightColor(newPool, slot.entityId, true);
      }
    }
  }

  // Update dissolve uniforms
  const camY = camPos.y;
  const players = world.getPlayers();
  const localPlayer = players && players.length > 0 ? players[0] : null;
  const playerPos = localPlayer?.node?.position ?? camPos;

  const env = world.getSystem("environment") as {
    sunLight?: { intensity: number };
    lightDirection?: THREE.Vector3;
    hemisphereLight?: { color: THREE.Color };
  } | null;

  const wind = world.getSystem("wind") as Wind | null;

  for (const pool of pools.values()) {
    for (const lodPool of [pool.lod0, pool.lod1, pool.lod2, pool.depleted]) {
      if (!lodPool) continue;

      for (const mat of lodPool.materials) {
        mat.dissolveUniforms.cameraPos.value.set(camPos.x, camY, camPos.z);
        mat.dissolveUniforms.playerPos.value.set(
          playerPos.x,
          playerPos.y,
          playerPos.z,
        );

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
          if (wind) {
            treeMat.treeUniforms.windTime.value = wind.uniforms.time.value;
            treeMat.treeUniforms.windStrength.value =
              wind.uniforms.windStrength.value;
            const wd = wind.uniforms.windDirection.value;
            treeMat.treeUniforms.windDirection.value.set(wd.x, wd.z);
          }
        }
      }
    }
  }
}
