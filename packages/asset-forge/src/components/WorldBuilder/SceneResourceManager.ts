/**
 * SceneResourceManager — Coordinates GPU resource lifecycle to prevent
 * WebGPU device loss on Metal (macOS).
 *
 * Metal's WebGPU staging buffer pool is limited. Bulk GPU buffer creation
 * (adding many scene objects at once) or destruction (disposing many
 * geometries/materials at once) exhausts the pool and triggers device
 * destruction by the browser's GPU process.
 *
 * This manager enforces two critical invariants:
 *
 *   1. PHASE SEPARATION — GPU uploads (staging new objects) and GPU
 *      destruction (disposing old resources) NEVER run in the same frame.
 *      Staging completes first, then disposal begins.
 *
 *   2. RATE LIMITING — Both staging and disposal are capped at N items
 *      per frame to avoid overwhelming Metal's backend.
 *
 * Additionally, when staging is active the manager hides entity marker
 * meshes (~18,895 objects from GameWorldEntitySync) to dramatically reduce
 * the GPU's per-frame workload, allowing a higher staging rate.
 *
 * Usage (in the animation loop):
 *
 *   // BEFORE render — stage new objects into the scene
 *   rm.processStaging(entitySyncRef.current);
 *
 *   // ... LOD updates, diagnostics, etc. ...
 *
 *   renderer.render(scene, camera);
 *
 *   // AFTER render — dispose old GPU resources
 *   rm.processDisposal();
 */

import { THREE } from "@/utils/webgpu-renderer";

// ============== Types ==============

export interface StagingItem {
  object: THREE.Object3D;
  parent: THREE.Object3D;
  onAdd?: () => void;
}

// ============== Configuration ==============

/** Objects staged per frame during normal operation */
const STAGING_BATCH_NORMAL = 4;

/**
 * Objects staged per frame when entity markers are hidden.
 *
 * Previously 16, but each staged item can be a building LOD (3 meshes with
 * unique geometry = 3 GPU buffer creations). At 16 items/frame, that's up to
 * 48 GPU buffer creations per frame, which exhausts Metal's staging buffer
 * pool and triggers device destruction. Keeping at 4 matches the normal rate.
 */
const STAGING_BATCH_FAST = 4;

/** Objects disposed per frame (after staging completes) */
const DISPOSAL_BATCH = 4;

// ============== Disposal helpers ==============

interface DisposalItem {
  object: THREE.Object3D;
  /** Skip material disposal — used for objects with shared materials (tiles, vegetation) */
  geometryOnly: boolean;
}

/** Dispose textures referenced by a material (map, normalMap, etc.) */
function disposeMaterialTextures(material: THREE.Material): void {
  const mat = material as unknown as Record<string, unknown>;
  const textureProps = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "emissiveMap",
    "alphaMap",
    "envMap",
    "lightMap",
    "bumpMap",
    "displacementMap",
  ];
  for (const prop of textureProps) {
    const tex = mat[prop];
    if (tex instanceof THREE.Texture) {
      tex.dispose();
    }
  }
}

function disposeItem(item: DisposalItem): void {
  item.object.traverse((child) => {
    if (child instanceof THREE.InstancedMesh) {
      // InstancedMesh.dispose() frees the instanceMatrix GPU buffer
      // but NOT the shared geometry/material from the species cache
      child.dispose();
    } else if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry?.dispose();
      if (!item.geometryOnly && child.material instanceof THREE.Material) {
        disposeMaterialTextures(child.material);
        child.material.dispose();
      }
    }
  });
}

// ============== Manager ==============

export class SceneResourceManager {
  private readonly stagingQueue: StagingItem[] = [];
  private readonly disposalQueue: DisposalItem[] = [];
  private entityMarkersHiddenByUs = false;

  // ---- Staging API ----

  /** Queue an object for gradual addition to the scene */
  stage(item: StagingItem): void {
    this.stagingQueue.push(item);
  }

  /** Remove pending staged items targeting a specific parent (e.g. before re-generating town markers) */
  flushStagedForParent(parent: THREE.Object3D): void {
    let writeIdx = 0;
    for (let i = 0; i < this.stagingQueue.length; i++) {
      if (this.stagingQueue[i].parent !== parent) {
        this.stagingQueue[writeIdx++] = this.stagingQueue[i];
      }
    }
    this.stagingQueue.length = writeIdx;
  }

  // ---- Disposal API ----

  /** Queue an object for deferred GPU resource disposal */
  queueDisposal(object: THREE.Object3D, geometryOnly = false): void {
    this.disposalQueue.push({ object, geometryOnly });
  }

  // ---- Frame processing ----

  /**
   * Process the staging queue — add objects to the scene in batches.
   *
   * Call BEFORE rendering so newly added objects (especially LODs)
   * are included in the current frame.
   *
   * When staging is active, entity markers are hidden to free GPU headroom,
   * and the batch size is increased for faster recovery.
   *
   * @param entitySync The entity marker group (may be hidden/shown)
   * @returns Number of items staged this frame
   */
  processStaging(entitySync: THREE.Group | null): number {
    // Phase gate: hide entity markers while staging is active
    if (this.stagingQueue.length > 0 && entitySync?.visible) {
      entitySync.visible = false;
      this.entityMarkersHiddenByUs = true;
    } else if (
      this.stagingQueue.length === 0 &&
      this.entityMarkersHiddenByUs &&
      entitySync
    ) {
      entitySync.visible = true;
      this.entityMarkersHiddenByUs = false;
    }

    if (this.stagingQueue.length === 0) return 0;

    const batchSize = this.entityMarkersHiddenByUs
      ? STAGING_BATCH_FAST
      : STAGING_BATCH_NORMAL;
    const end = Math.min(batchSize, this.stagingQueue.length);
    const batch = this.stagingQueue.splice(0, end);

    for (const item of batch) {
      item.parent.add(item.object);
      item.onAdd?.();
    }

    return batch.length;
  }

  /**
   * Process the disposal queue — free GPU resources in batches.
   *
   * Call AFTER rendering to ensure the GPU has finished using resources
   * referenced in the current frame's command buffer.
   *
   * Disposal is SKIPPED while staging is active (phase separation).
   *
   * @returns Number of items disposed this frame
   */
  processDisposal(): number {
    // Phase separation: never dispose while staging is active
    if (this.stagingQueue.length > 0) return 0;
    if (this.disposalQueue.length === 0) return 0;

    const end = Math.min(DISPOSAL_BATCH, this.disposalQueue.length);
    const batch = this.disposalQueue.splice(0, end);

    for (const item of batch) {
      disposeItem(item);
    }

    return batch.length;
  }

  // ---- Lifecycle ----

  /** Dispose all queued resources immediately (for component unmount) */
  flush(): void {
    this.stagingQueue.length = 0;
    for (const item of this.disposalQueue) {
      disposeItem(item);
    }
    this.disposalQueue.length = 0;
  }

  // ---- Accessors ----

  /** Whether the staging queue has pending items */
  get hasStagedWork(): boolean {
    return this.stagingQueue.length > 0;
  }

  /** Number of items waiting to be staged */
  get pendingStaged(): number {
    return this.stagingQueue.length;
  }

  /** Number of items waiting to be disposed */
  get pendingDisposal(): number {
    return this.disposalQueue.length;
  }

  /** Whether entity markers are currently hidden by this manager */
  get areMarkersHidden(): boolean {
    return this.entityMarkersHiddenByUs;
  }
}
