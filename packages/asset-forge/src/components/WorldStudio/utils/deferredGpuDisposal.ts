/**
 * Centralized deferred GPU resource lifecycle management.
 *
 * WebGPU on Metal (macOS) has a limited staging buffer pool. Both bulk
 * CREATION (adding many scene objects) and bulk DESTRUCTION (disposing many
 * geometries/materials) in a single frame exhaust the pool and trigger
 * device destruction by Chrome's GPU process.
 *
 * This module provides TWO shared queues:
 *
 *   1. DISPOSAL QUEUE — GPU resources queued for deferred .dispose().
 *   2. ADDITION QUEUE — Scene objects queued for deferred parenting.
 *
 * CRITICAL: This module does NOT run its own rAF loop. Processing is driven
 * by the render loop in TileBasedTerrain via processDeferredFrame(). This
 * ensures the deferred system and SceneResourceManager NEVER create GPU
 * buffers in the same frame — only one system processes per frame.
 */

import * as THREE from "three/webgpu";

// ============== Configuration ==============

/** GPU resources disposed per frame (normal operation) */
const DISPOSAL_BATCH_NORMAL = 4;

/**
 * GPU resources disposed per frame when the queue is large.
 * After a wizard apply, thousands of resources queue up. At 4/frame it takes
 * ~13 seconds to drain, during which Metal can reclaim backing memory for
 * buffers that were removed from the scene graph but not yet .dispose()'d,
 * causing "setIndexBuffer: parameter 1 is not of type 'GPUBuffer'" crashes.
 * Draining faster (32/frame) keeps the backlog under ~3 seconds.
 */
const DISPOSAL_BATCH_BURST = 32;

/** Threshold above which we switch to burst disposal rate */
const DISPOSAL_BURST_THRESHOLD = 100;

/**
 * Scene objects added to parents per frame.
 *
 * Entity markers use shared geometry + pooled materials so each addition
 * creates ~0 new GPU buffers (geometry/pipeline already uploaded). This
 * allows a higher batch size for faster marker population.
 */
const ADDITION_BATCH_SIZE = 32;

// ============== Disposal Queue ==============

interface Disposable {
  dispose(): void;
}

const disposalQueue: Disposable[] = [];

// ============== Addition Queue ==============

interface AdditionItem {
  object: THREE.Object3D;
  parent: THREE.Object3D;
  onAdd?: () => void;
}

const additionQueue: AdditionItem[] = [];

// ============== Stats ==============

let _totalDisposed = 0;
let _totalAdded = 0;

// ============== Frame Processing (called by render loop) ==============

/**
 * Process one frame's worth of deferred GPU operations.
 *
 * MUST be called from the render loop — this module has no internal rAF.
 * The render loop decides WHEN to call this based on SceneResourceManager
 * state, ensuring the two systems never overlap.
 *
 * Phase separation: additions complete before disposals start.
 *
 * @returns true if there is still pending work
 */
export function processDeferredFrame(): boolean {
  // Process additions first (staging before disposal).
  // CRITICAL: Only add to VISIBLE parents. Adding objects to a hidden parent
  // means the renderer skips them until the parent becomes visible — at which
  // point ALL accumulated children get GPU buffers created in ONE frame,
  // exhausting Metal's staging buffer pool. By skipping hidden parents here,
  // we ensure markers are added gradually after the overlay becomes visible.
  if (additionQueue.length > 0) {
    let processEnd = 0;
    const limit = Math.min(ADDITION_BATCH_SIZE, additionQueue.length);
    for (let i = 0; i < limit; i++) {
      if (!additionQueue[i].parent.visible) break;
      processEnd++;
    }

    if (processEnd > 0) {
      const batch = additionQueue.splice(0, processEnd);
      for (const item of batch) {
        item.parent.add(item.object);
        item.onAdd?.();
      }
      _totalAdded += batch.length;
      return true;
    }

    // All front-of-queue items target hidden parents — fall through to
    // disposal so GPU cleanup isn't blocked by unprocessable additions.
  }

  // Process disposals when no visible additions remain.
  // Use burst rate when the queue is large to prevent Metal from reclaiming
  // backing memory before we call .dispose().
  if (disposalQueue.length > 0) {
    const batchSize =
      disposalQueue.length > DISPOSAL_BURST_THRESHOLD
        ? DISPOSAL_BATCH_BURST
        : DISPOSAL_BATCH_NORMAL;
    const end = Math.min(batchSize, disposalQueue.length);
    for (let i = 0; i < end; i++) {
      try {
        disposalQueue[i].dispose();
      } catch {
        // WebGPU internal state may already be cleaned up
      }
    }
    disposalQueue.splice(0, end);
    _totalDisposed += end;
    return disposalQueue.length > 0 || additionQueue.length > 0;
  }

  return additionQueue.length > 0;
}

/**
 * Process ONLY the disposal queue — free GPU resources without touching additions.
 *
 * Called every frame by the render loop regardless of SceneResourceManager state.
 * Disposal only destroys GPU buffers (never creates them), so it is safe to run
 * alongside SceneResourceManager staging. Without this, wizard apply leaves
 * thousands of unreleased GPU resources while new objects are being staged,
 * exhausting Metal's staging buffer pool and crashing the device.
 *
 * @returns Number of items disposed this frame
 */
export function processDeferredDisposalOnly(): number {
  if (disposalQueue.length === 0) return 0;

  const batchSize =
    disposalQueue.length > DISPOSAL_BURST_THRESHOLD
      ? DISPOSAL_BATCH_BURST
      : DISPOSAL_BATCH_NORMAL;
  const end = Math.min(batchSize, disposalQueue.length);
  for (let i = 0; i < end; i++) {
    try {
      disposalQueue[i].dispose();
    } catch {
      // WebGPU internal state may already be cleaned up
    }
  }
  disposalQueue.splice(0, end);
  _totalDisposed += end;
  return end;
}

// ============== Disposal API ==============

/**
 * Queue a single GPU resource for deferred disposal.
 */
export function queueDisposal(resource: Disposable): void {
  disposalQueue.push(resource);
}

/**
 * Queue all GPU resources in a THREE.Group for deferred disposal.
 * The group is cleared immediately (children removed from scene graph)
 * but actual GPU resource deallocation happens across future frames.
 */
export function deferredDisposeGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child === group) return;
    if (
      child instanceof THREE.Line ||
      child instanceof THREE.Mesh ||
      child instanceof THREE.InstancedMesh
    ) {
      // Skip shared/cached resources — these are owned by GameWorldEntitySync
      // or GameWorldAssets singleton caches and must not be disposed here
      const geo = child.geometry;
      if (!geo.userData?._cachedModel && !geo.userData?._shared) {
        disposalQueue.push(geo);
      }
      if (Array.isArray(child.material)) {
        for (const m of child.material) {
          if (!m.userData?._cachedModel && !m.userData?._shared) {
            disposalQueue.push(m);
          }
        }
      } else {
        const mat = child.material;
        if (!mat.userData?._cachedModel && !mat.userData?._shared) {
          disposalQueue.push(mat);
        }
      }
    }
    if (child instanceof THREE.Sprite) {
      if (child.material.map) disposalQueue.push(child.material.map);
      disposalQueue.push(child.material);
    }
  });
  group.clear();
}

// ============== Addition API ==============

/**
 * Queue an object for deferred addition to a parent in the scene graph.
 */
export function stageAddition(
  object: THREE.Object3D,
  parent: THREE.Object3D,
  onAdd?: () => void,
): void {
  additionQueue.push({ object, parent, onAdd });
}

/**
 * Cancel all pending staged additions targeting a specific parent.
 */
export function cancelStagedAdditions(parent: THREE.Object3D): void {
  let writeIdx = 0;
  for (let i = 0; i < additionQueue.length; i++) {
    if (additionQueue[i].parent !== parent) {
      additionQueue[writeIdx++] = additionQueue[i];
    }
  }
  additionQueue.length = writeIdx;
}

/**
 * Cancel the pending staged addition for a specific object.
 */
export function cancelStagedObject(object: THREE.Object3D): void {
  let writeIdx = 0;
  for (let i = 0; i < additionQueue.length; i++) {
    if (additionQueue[i].object !== object) {
      additionQueue[writeIdx++] = additionQueue[i];
    }
  }
  additionQueue.length = writeIdx;
}

// ============== Diagnostics ==============

export interface GpuLifecycleStats {
  pendingDisposals: number;
  pendingAdditions: number;
  totalDisposed: number;
  totalAdded: number;
}

export function getGpuLifecycleStats(): GpuLifecycleStats {
  return {
    pendingDisposals: disposalQueue.length,
    pendingAdditions: additionQueue.length,
    totalDisposed: _totalDisposed,
    totalAdded: _totalAdded,
  };
}
