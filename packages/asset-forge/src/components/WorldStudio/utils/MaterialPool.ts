/**
 * MaterialPool — GPU material cache with reference counting
 *
 * Eliminates per-entity material allocations for markers. All abstract
 * markers of the same type share a single material instance. Materials
 * are only disposed when the pool itself is disposed (on hook unmount).
 *
 * For overlay materials (boundary lines, zone fills), each overlay rebuild
 * uses `acquireOverlay()` with a unique key. Previous overlay materials
 * are released on the next rebuild via `releaseOverlay()`.
 */

import * as THREE from "three";
import {
  MeshStandardNodeMaterial,
  MeshBasicNodeMaterial,
  LineBasicNodeMaterial,
} from "three/webgpu";

// ============== TYPES ==============

type MaterialType = "standard" | "basic" | "lineBasic";

interface PoolEntry {
  material: THREE.Material;
  refCount: number;
}

interface MaterialConfig {
  type: MaterialType;
  color: number;
  emissive?: number;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  side?: THREE.Side;
}

// ============== POOL ==============

export class MaterialPool {
  private pool = new Map<string, PoolEntry>();
  private disposed = false;

  /**
   * Get or create a material matching the config. Materials with identical
   * configs share a single GPU resource. Returns the same instance every
   * time for the same key.
   */
  acquire(key: string, config: MaterialConfig): THREE.Material {
    if (this.disposed) {
      throw new Error("MaterialPool.acquire() called after dispose");
    }

    const existing = this.pool.get(key);
    if (existing) {
      existing.refCount++;
      return existing.material;
    }

    const material = this.createMaterial(config);
    this.pool.set(key, { material, refCount: 1 });
    return material;
  }

  /**
   * Convenience: acquire a marker material (MeshStandardNodeMaterial with
   * color + emissive preset). Keyed by marker type string.
   */
  acquireMarker(type: string, color: number): THREE.Material {
    return this.acquire(`marker:${type}`, {
      type: "standard",
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      roughness: 0.7,
      metalness: 0.2,
    });
  }

  /**
   * Decrement reference count. Material stays in pool even at refCount 0
   * (allows reuse if another entity of the same type is added later).
   * Only `dispose()` actually frees GPU memory.
   */
  release(key: string): void {
    const entry = this.pool.get(key);
    if (entry && entry.refCount > 0) {
      entry.refCount--;
    }
  }

  /** Release a marker material by type. */
  releaseMarker(type: string): void {
    this.release(`marker:${type}`);
  }

  /** Number of unique materials currently in the pool. */
  get size(): number {
    return this.pool.size;
  }

  /** Dispose all materials and clear the pool. Call on hook unmount. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const [, entry] of this.pool) {
      try {
        entry.material.dispose();
      } catch {
        /* WebGPU race condition — already cleaned up */
      }
    }
    this.pool.clear();
  }

  // ============== INTERNALS ==============

  private createMaterial(config: MaterialConfig): THREE.Material {
    switch (config.type) {
      case "standard": {
        const mat = new MeshStandardNodeMaterial();
        mat.color = new THREE.Color(config.color);
        if (config.emissive !== undefined)
          mat.emissive = new THREE.Color(config.emissive);
        if (config.emissiveIntensity !== undefined)
          mat.emissiveIntensity = config.emissiveIntensity;
        if (config.roughness !== undefined) mat.roughness = config.roughness;
        if (config.metalness !== undefined) mat.metalness = config.metalness;
        if (config.transparent !== undefined)
          mat.transparent = config.transparent;
        if (config.opacity !== undefined) mat.opacity = config.opacity;
        if (config.depthWrite !== undefined) mat.depthWrite = config.depthWrite;
        return mat;
      }
      case "basic": {
        const mat = new MeshBasicNodeMaterial();
        mat.color = new THREE.Color(config.color);
        if (config.transparent !== undefined)
          mat.transparent = config.transparent;
        if (config.opacity !== undefined) mat.opacity = config.opacity;
        if (config.depthWrite !== undefined) mat.depthWrite = config.depthWrite;
        if (config.side !== undefined) mat.side = config.side;
        return mat;
      }
      case "lineBasic": {
        const mat = new LineBasicNodeMaterial();
        mat.color = new THREE.Color(config.color);
        if (config.transparent !== undefined)
          mat.transparent = config.transparent;
        if (config.opacity !== undefined) mat.opacity = config.opacity;
        if (config.depthWrite !== undefined) mat.depthWrite = config.depthWrite;
        return mat;
      }
    }
  }
}
