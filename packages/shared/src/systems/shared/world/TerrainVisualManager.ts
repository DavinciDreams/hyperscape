/**
 * TerrainVisualManager — Manages the lifecycle of quad-tree terrain visual chunks.
 *
 * Listens to TerrainQuadTree events, generates geometry via
 * TerrainQuadChunkGenerator, and adds/removes meshes from the scene.
 *
 * CLIENT-ONLY: Server terrain uses the flat tile grid.
 */

import THREE from "../../../extras/three/three";
import {
  TerrainQuadTree,
  type TerrainQuadNode,
  type QuadTreeConfig,
  type QuadTreeListener,
} from "./TerrainQuadTree";
import {
  generateQuadChunkGeometry,
  type ChunkTerrainProvider,
} from "./TerrainQuadChunkGenerator";

export interface TerrainVisualChunk {
  key: string;
  node: TerrainQuadNode;
  mesh: THREE.Mesh;
  heightData: Float32Array;
}

interface PendingChunkRequest {
  node: TerrainQuadNode;
  priority: number;
}

/**
 * Orchestrates quad-tree LOD terrain rendering.
 *
 * Usage in TerrainSystem:
 *   this.visualManager = new TerrainVisualManager(config, provider, container, material);
 *   // In update loop:
 *   this.visualManager.update(playerX, playerZ, timeBudgetMs);
 */
export class TerrainVisualManager implements QuadTreeListener {
  private quadTree: TerrainQuadTree;
  private provider: ChunkTerrainProvider;
  private container: THREE.Group;
  private material: THREE.Material;
  private chunks = new Map<string, TerrainVisualChunk>();
  private pendingQueue: PendingChunkRequest[] = [];
  private pendingSet = new Set<number>();
  private playerX = 0;
  private playerZ = 0;
  private debugWireframe: boolean;

  /** Max chunks to generate per frame */
  private maxChunksPerFrame = 6;
  /** Time budget per frame for chunk generation (ms) */
  private timeBudgetMs = 16;

  constructor(
    config: Partial<QuadTreeConfig>,
    provider: ChunkTerrainProvider,
    container: THREE.Group,
    material: THREE.Material,
    debugWireframe = false,
  ) {
    this.provider = provider;
    this.container = container;
    this.material = material;
    this.debugWireframe = debugWireframe;

    this.quadTree = new TerrainQuadTree(config);
    this.quadTree.setListener(this);
  }

  /** Update quad-tree based on player position. Call every frame. */
  update(playerX: number, playerZ: number): void {
    this.playerX = playerX;
    this.playerZ = playerZ;
    this.quadTree.update(playerX, playerZ);
    this.processPendingQueue();
  }

  /** Dispose all chunks and the quad-tree. */
  dispose(): void {
    this.quadTree.dispose();
    for (const chunk of this.chunks.values()) {
      this.removeMeshFromScene(chunk);
    }
    this.chunks.clear();
    this.pendingQueue = [];
    this.pendingSet.clear();
  }

  /** Get the quad-tree for debug/stats access */
  getQuadTree(): TerrainQuadTree {
    return this.quadTree;
  }

  /** Get all active visual chunks */
  getChunks(): ReadonlyMap<string, TerrainVisualChunk> {
    return this.chunks;
  }

  /** Debug stats */
  getStats(): {
    totalNodes: number;
    visualChunks: number;
    pendingQueue: number;
  } {
    return {
      totalNodes: this.quadTree.totalNodeCount,
      visualChunks: this.chunks.size,
      pendingQueue: this.pendingQueue.length,
    };
  }

  // =========================================================================
  // QuadTreeListener implementation
  // =========================================================================

  onNodeNeedsGeometry(node: TerrainQuadNode): void {
    if (this.pendingSet.has(node.id)) return;

    const dx = node.centerX - this.playerX;
    const dz = node.centerZ - this.playerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const priority = node.size + dist * 0.1;

    this.pendingQueue.push({ node, priority });
    this.pendingSet.add(node.id);

    this.pendingQueue.sort((a, b) => a.priority - b.priority);
  }

  onNodeDestroyGeometry(node: TerrainQuadNode): void {
    const key = node.visualChunkKey;
    if (key !== null) {
      const chunk = this.chunks.get(key);
      if (chunk) {
        this.removeMeshFromScene(chunk);
        this.chunks.delete(key);
      }
      node.visualChunkKey = null;
    }
    this.pendingSet.delete(node.id);
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  private processPendingQueue(): void {
    if (this.pendingQueue.length === 0) return;

    const startTime = performance.now();
    let generated = 0;

    while (this.pendingQueue.length > 0 && generated < this.maxChunksPerFrame) {
      const elapsed = performance.now() - startTime;
      if (elapsed > this.timeBudgetMs) break;

      const request = this.pendingQueue.shift()!;
      this.pendingSet.delete(request.node.id);

      // Node may have been destroyed while queued
      if (!request.node.isFinal) continue;
      if (request.node.visualChunkKey !== null) continue;

      this.generateChunk(request.node);
      generated++;
    }
  }

  /** Debug wireframe colors per depth level (depth 0 = red, 1 = orange, ..., 4 = green) */
  private static DEBUG_DEPTH_COLORS = [
    0xff0000, // depth 0 — red (largest, farthest)
    0xff8800, // depth 1 — orange
    0xffff00, // depth 2 — yellow
    0x00ccff, // depth 3 — cyan
    0x00ff44, // depth 4 — green (smallest, closest)
  ];

  private generateChunk(node: TerrainQuadNode): void {
    const key = `quad_${node.id}_d${node.depth}_${node.centerX.toFixed(0)}_${node.centerZ.toFixed(0)}`;

    let result;
    try {
      result = generateQuadChunkGeometry(
        node,
        this.provider,
        this.quadTree.config.skirtDrop,
      );
    } catch (err) {
      console.error(
        `[TerrainVisualManager] Failed to generate chunk ${key}:`,
        err,
      );
      return;
    }

    let meshMaterial: THREE.Material;
    if (this.debugWireframe) {
      const depthColor =
        TerrainVisualManager.DEBUG_DEPTH_COLORS[
          Math.min(
            node.depth,
            TerrainVisualManager.DEBUG_DEPTH_COLORS.length - 1,
          )
        ];
      meshMaterial = new THREE.MeshBasicMaterial({
        color: depthColor,
        wireframe: true,
      });
    } else {
      meshMaterial = this.material;
    }

    const mesh = new THREE.Mesh(result.geometry, meshMaterial);
    mesh.position.set(node.centerX, 0, node.centerZ);
    mesh.name = `QuadTerrain_${key}`;
    mesh.receiveShadow = !this.debugWireframe;
    mesh.castShadow = !this.debugWireframe;
    mesh.frustumCulled = true;
    mesh.userData = {
      type: "terrain",
      walkable: true,
      clickable: true,
      quadNodeId: node.id,
      depth: node.depth,
      size: node.size,
      resolution: node.resolution,
    };

    this.container.add(mesh);

    const chunk: TerrainVisualChunk = {
      key,
      node,
      mesh,
      heightData: result.heightData,
    };

    this.chunks.set(key, chunk);
    node.visualChunkKey = key;

    node.testReady();
  }

  private removeMeshFromScene(chunk: TerrainVisualChunk): void {
    if (chunk.mesh.parent) {
      this.container.remove(chunk.mesh);
    }
    chunk.mesh.geometry.dispose();
  }
}
