/**
 * TreeGLBVisualStrategy — Unified tree visual strategy.
 *
 * Delegates to one of two instancers based on the manifest config:
 * - **BatchedMesh** (GLBTreeBatchedInstancer) for trees with `modelVariants`
 *   — fewer draw calls when many variants share the same material.
 * - **InstancedMesh** (GLBTreeInstancer) for trees with a single `model` path.
 *
 * All other lifecycle methods (depleted, highlight, respawn, destroy)
 * dispatch to whichever instancer owns the entity.
 */

import THREE from "../../../extras/three/three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  addInstance as addInstancedTree,
  removeInstance as removeInstancedTree,
  setDepleted as setInstancedDepleted,
  hasDepleted as hasInstancedDepleted,
  setHighlight as setInstancedHighlight,
  getModelDimensions as getInstancedDimensions,
  getProxyGeometry as getInstancedProxyGeometry,
  hasInstance as isInInstancedPool,
  updateGLBTreeInstancer,
} from "../../../systems/shared/world/GLBTreeInstancer";
import {
  addInstance as addBatchedTree,
  removeInstance as removeBatchedTree,
  setDepleted as setBatchedDepleted,
  hasDepleted as hasBatchedDepleted,
  setHighlight as setBatchedHighlight,
  getModelDimensions as getBatchedDimensions,
  getProxyGeometry as getBatchedProxyGeometry,
  hasInstance as isInBatchedPool,
  updateGLBTreeBatchedInstancer,
} from "../../../systems/shared/world/GLBTreeBatchedInstancer";
import type {
  ResourceVisualContext,
  ResourceVisualStrategy,
} from "./ResourceVisualStrategy";

/**
 * Merge multiple BufferGeometry parts into one for the collision proxy.
 * Only copies position + index — normals/UVs are unnecessary for raycasting.
 */
function mergeGeometries(
  parts: THREE.BufferGeometry[],
): THREE.BufferGeometry | null {
  // Filter out any parts missing position data (malformed GLBs)
  const valid = parts.filter((g) => g.getAttribute("position"));
  if (valid.length === 0) return null;
  // Single-part: return the shared geometry directly — caller must clone before mutating.
  if (valid.length === 1) return valid[0];

  let totalVerts = 0;
  let totalIndices = 0;
  for (const g of valid) {
    const pos = g.getAttribute("position");
    totalVerts += pos.count;
    totalIndices += g.index ? g.index.count : pos.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIndices);
  let vertOffset = 0;
  let idxOffset = 0;

  for (const g of valid) {
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    // Bulk copy when the backing array is a contiguous Float32Array (common for loaded GLBs)
    if (pos.array instanceof Float32Array && pos.itemSize === 3) {
      positions.set(
        new Float32Array(pos.array.buffer, pos.array.byteOffset, pos.count * 3),
        vertOffset * 3,
      );
    } else {
      for (let i = 0; i < pos.count; i++) {
        positions[(vertOffset + i) * 3] = pos.getX(i);
        positions[(vertOffset + i) * 3 + 1] = pos.getY(i);
        positions[(vertOffset + i) * 3 + 2] = pos.getZ(i);
      }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) {
        indices[idxOffset + i] = g.index.getX(i) + vertOffset;
      }
      idxOffset += g.index.count;
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices[idxOffset + i] = vertOffset + i;
      }
      idxOffset += pos.count;
    }
    vertOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  return merged;
}

// Cache merged+scaled proxy geometry per (sourceGeometries identity, scale) to avoid
// redundant merge/clone/scale work for trees sharing the same model variant and scale.
const _proxyGeometryCache = new Map<
  THREE.BufferGeometry[],
  Map<number, THREE.BufferGeometry>
>();

/**
 * Dispose all cached proxy geometries and clear the cache.
 * Must be called during world teardown to prevent GPU buffer leaks.
 */
export function clearProxyGeometryCache(): void {
  for (const scaleMap of _proxyGeometryCache.values()) {
    for (const geo of scaleMap.values()) geo.dispose();
  }
  _proxyGeometryCache.clear();
}

function getOrCreateProxyGeometry(
  sourceGeometries: THREE.BufferGeometry[],
  scale: number,
): THREE.BufferGeometry | null {
  // Round scale to 3 decimal places to avoid floating-point cache misses
  const key = Math.round(scale * 1000) / 1000;
  let scaleMap = _proxyGeometryCache.get(sourceGeometries);
  if (scaleMap) {
    const cached = scaleMap.get(key);
    if (cached) return cached;
  }

  const merged = mergeGeometries(sourceGeometries);
  if (!merged) return null;

  // Always clone so mergeGeometries' single-part return (shared ref) is never mutated
  const scaled = merged.clone();
  scaled.scale(scale, scale, scale);

  if (!scaleMap) {
    scaleMap = new Map();
    _proxyGeometryCache.set(sourceGeometries, scaleMap);
  }
  scaleMap.set(key, scaled);
  return scaled;
}

function createCollisionProxy(
  ctx: ResourceVisualContext,
  scale: number,
  batched: boolean,
): void {
  // Try to use the actual LOD2 model geometry for a pixel-accurate collision proxy.
  // This matches the visible tree silhouette so clicks only register on the model itself.
  const proxyData = batched
    ? getBatchedProxyGeometry(ctx.id)
    : getInstancedProxyGeometry(ctx.id);
  const cachedGeometry = proxyData
    ? getOrCreateProxyGeometry(proxyData.geometries, scale)
    : null;

  let geometry: THREE.BufferGeometry;
  let yPos: number;

  if (cachedGeometry && proxyData) {
    // NOTE: This geometry is shared across all proxies with the same model+scale.
    // It must not be mutated — the proxy mesh is invisible and used only for
    // raycasting, so Three.js internals won't modify it in normal operation.
    geometry = cachedGeometry;
    // Align with visual: instancer shifts instances up by yOffset * scale
    yPos = proxyData.yOffset * scale;
  } else {
    // Fallback: tighter trunk-only cylinder (only if LOD geometry unavailable).
    // Reduced from 0.4 to 0.25 since the LOD proxy now handles canopy clicks;
    // this path is only hit during initial load before LODs are ready.
    const dims = batched
      ? getBatchedDimensions(ctx.id)
      : getInstancedDimensions(ctx.id);
    const height = (dims?.height ?? 8) * scale;
    const fullRadius = (dims?.radius ?? 1) * scale;
    const radius = Math.max(fullRadius * 0.25, 0.3);
    geometry = new THREE.CylinderGeometry(radius, radius, height, 6);
    yPos = height / 2;
  }

  const material = new MeshBasicNodeMaterial();
  material.visible = false;

  const proxy = new THREE.Mesh(geometry, material);
  proxy.position.y = yPos;
  proxy.name = `TreeProxy_${ctx.id}`;
  proxy.userData = {
    type: "resource",
    entityId: ctx.id,
    name: ctx.config.name,
    interactable: true,
    resourceType: ctx.config.resourceType,
  };
  proxy.layers.set(1);

  ctx.node.add(proxy);
  ctx.setMesh(proxy);
}

function isBatched(entityId: string): boolean {
  return isInBatchedPool(entityId);
}

export class TreeGLBVisualStrategy implements ResourceVisualStrategy {
  async createVisual(ctx: ResourceVisualContext): Promise<void> {
    const { config, id, position } = ctx;

    const baseScale = config.modelScale ?? 3.0;
    const worldPos = new THREE.Vector3();
    ctx.node.getWorldPosition(worldPos);

    const rotHash = ctx.hashString(
      `${id}_${position.x.toFixed(1)}_${position.z.toFixed(1)}`,
    );
    const rotation = ((rotHash % 1000) / 1000) * Math.PI * 2;

    let success = false;

    if (config.modelVariants?.length) {
      const treeType = config.resourceId.replace(/^tree_/, "");
      const hash = ctx.hashString(id) >>> 0;
      const variantIndex = hash % config.modelVariants.length;

      success = await addBatchedTree(
        treeType,
        config.modelVariants,
        variantIndex,
        id,
        worldPos,
        rotation,
        baseScale,
        config.depletedModelPath ?? null,
        config.depletedModelScale ?? 0.3,
      );
    } else {
      let modelPath = config.model;
      if (!modelPath) return;

      success = await addInstancedTree(
        modelPath,
        id,
        worldPos,
        rotation,
        baseScale,
        config.depletedModelPath ?? null,
        config.depletedModelScale ?? 0.3,
      );
    }

    if (success) {
      createCollisionProxy(ctx, baseScale, !!config.modelVariants?.length);
    }
  }

  async onDepleted(ctx: ResourceVisualContext): Promise<boolean> {
    const b = isBatched(ctx.id);
    if (b) {
      setBatchedDepleted(ctx.id, true);
    } else {
      setInstancedDepleted(ctx.id, true);
    }
    const proxy = ctx.getMesh();
    if (proxy) {
      proxy.userData.depleted = true;
      proxy.userData.interactable = false;
    }
    return b ? hasBatchedDepleted(ctx.id) : hasInstancedDepleted(ctx.id);
  }

  setShaderHighlight(ctx: ResourceVisualContext, on: boolean): void {
    if (isBatched(ctx.id)) {
      setBatchedHighlight(ctx.id, on);
    } else {
      setInstancedHighlight(ctx.id, on);
    }
  }

  async onRespawn(ctx: ResourceVisualContext): Promise<void> {
    if (isBatched(ctx.id)) {
      setBatchedDepleted(ctx.id, false);
    } else {
      setInstancedDepleted(ctx.id, false);
    }
    const proxy = ctx.getMesh();
    if (proxy) {
      proxy.userData.depleted = false;
      proxy.userData.interactable = true;
    }
  }

  update(): void {
    updateGLBTreeInstancer();
    updateGLBTreeBatchedInstancer();
  }

  destroy(ctx: ResourceVisualContext): void {
    if (isBatched(ctx.id)) {
      removeBatchedTree(ctx.id);
    } else {
      removeInstancedTree(ctx.id);
    }
  }
}
