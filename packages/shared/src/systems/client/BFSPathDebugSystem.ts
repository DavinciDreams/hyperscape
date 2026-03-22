/**
 * BFSPathDebugSystem — visual overlay of the local player's BFS-calculated path.
 *
 * When enabled, draws colored ground markers along the path the server sent
 * to the client. Useful for diagnosing pathfinding issues (walls, bridges, etc.).
 *
 * Toggle: Press 'B' when F5 panel is visible, or via console:
 *   world.bfsPathDebug.setEnabled(true)
 *   world.bfsPathDebug.toggle()
 *
 * @client-only
 */

import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { System } from "../shared/infrastructure/System";
import type { World } from "../../core/World";
import { tileToWorld, type TileCoord } from "../shared/movement/TileSystem";
import type { TerrainSystem } from "../shared/world/TerrainSystem";
import type { BridgeSystem } from "../shared/world/BridgeSystem";

// Path marker colors
const PATH_COLOR = 0x00ccff; // Cyan — current remaining path
const NEXT_TILE_COLOR = 0xffff00; // Yellow — next tile
const DEST_COLOR = 0xff4444; // Red — destination tile

// Marker size (slightly smaller than 1m tile)
const MARKER_SIZE = 0.7;
const MARKER_HEIGHT_OFFSET = 0.08; // Hover above terrain to avoid z-fighting
const MAX_MARKERS = 200; // Max path length

export class BFSPathDebugSystem extends System {
  private enabled = false;
  private scene: THREE.Scene | null = null;
  private debugGroup: THREE.Group | null = null;

  // Instanced mesh for path tiles
  private pathMesh: THREE.InstancedMesh | null = null;
  private nextTileMesh: THREE.Mesh | null = null;
  private destMesh: THREE.Mesh | null = null;

  // Shared geometry
  private markerGeometry: THREE.PlaneGeometry | null = null;

  // Materials
  private pathMaterial: MeshBasicNodeMaterial | null = null;
  private nextTileMaterial: MeshBasicNodeMaterial | null = null;
  private destMaterial: MeshBasicNodeMaterial | null = null;

  // Re-usable matrix for instancing
  private _tempMatrix = new THREE.Matrix4();

  // Cached path for change detection
  private _lastPathLength = -1;
  private _lastPathFirstX = NaN;
  private _lastPathFirstZ = NaN;

  constructor(world: World) {
    super(world);
  }

  async start(): Promise<void> {
    this.scene = this.world.stage?.scene ?? null;

    // Create geometry (flat plane rotated to lie on XZ ground)
    this.markerGeometry = new THREE.PlaneGeometry(MARKER_SIZE, MARKER_SIZE);
    this.markerGeometry.rotateX(-Math.PI / 2);

    // Create materials
    this.pathMaterial = new MeshBasicNodeMaterial();
    this.pathMaterial.color = new THREE.Color(PATH_COLOR);
    this.pathMaterial.transparent = true;
    this.pathMaterial.opacity = 0.45;
    this.pathMaterial.depthWrite = false;
    this.pathMaterial.side = THREE.DoubleSide;

    this.nextTileMaterial = new MeshBasicNodeMaterial();
    this.nextTileMaterial.color = new THREE.Color(NEXT_TILE_COLOR);
    this.nextTileMaterial.transparent = true;
    this.nextTileMaterial.opacity = 0.6;
    this.nextTileMaterial.depthWrite = false;
    this.nextTileMaterial.side = THREE.DoubleSide;

    this.destMaterial = new MeshBasicNodeMaterial();
    this.destMaterial.color = new THREE.Color(DEST_COLOR);
    this.destMaterial.transparent = true;
    this.destMaterial.opacity = 0.6;
    this.destMaterial.depthWrite = false;
    this.destMaterial.side = THREE.DoubleSide;

    // Setup keyboard toggle
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.handleKeyDown);
    }

    // Expose to console
    (this.world as { bfsPathDebug?: BFSPathDebugSystem }).bfsPathDebug = this;

    console.log(
      "[BFSPathDebug] Ready — Press 'B' (with F5 panel open) to toggle path overlay",
    );
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    // B key toggles path debug (only when dev stats panel is visible)
    if (
      (e.key === "b" || e.key === "B") &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      const devStats = this.world.getSystem("devStats") as {
        isVisible?: () => boolean;
      } | null;
      if (devStats?.isVisible?.()) {
        e.preventDefault();
        this.toggle();
      }
    }
  };

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[BFSPathDebug] ${enabled ? "ENABLED" : "DISABLED"}`);

    if (!enabled) {
      this.clearVisualization();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  override update(_deltaTime: number): void {
    if (!this.enabled) return;

    // Get the local player's current BFS path from TileInterpolator
    const clientNet = this.world.getSystem("network") as {
      tileInterpolator?: { getEntityPath: (id: string) => TileCoord[] | null };
    } | null;
    const playerId = this.world.entities.player?.id;
    if (!clientNet?.tileInterpolator || !playerId) return;

    const path = clientNet.tileInterpolator.getEntityPath(playerId);
    if (!path || path.length === 0) {
      // No active path — clear markers
      if (this._lastPathLength !== 0) {
        this.clearVisualization();
        this._lastPathLength = 0;
      }
      return;
    }

    // Quick change detection: skip if path hasn't changed
    if (
      path.length === this._lastPathLength &&
      path[0].x === this._lastPathFirstX &&
      path[0].z === this._lastPathFirstZ
    ) {
      return;
    }

    this._lastPathLength = path.length;
    this._lastPathFirstX = path[0].x;
    this._lastPathFirstZ = path[0].z;

    // Rebuild visualization
    this.rebuildPath(path);
  }

  private rebuildPath(path: TileCoord[]): void {
    if (!this.scene || !this.markerGeometry) return;

    // Ensure debug group exists
    if (!this.debugGroup) {
      this.debugGroup = new THREE.Group();
      this.debugGroup.name = "bfs-path-debug";
      this.debugGroup.renderOrder = 999;
      this.scene.add(this.debugGroup);
    }

    // Get terrain + bridge systems for Y positioning
    const terrain = this.world.getSystem("terrain") as TerrainSystem | null;
    const bridge = this.world.getSystem("bridge") as BridgeSystem | null;

    const getY = (wx: number, wz: number): number => {
      // Bridge deck takes priority
      const deckH = bridge?.getDeckHeightAt(Math.floor(wx), Math.floor(wz));
      if (deckH !== null && deckH !== undefined)
        return deckH + MARKER_HEIGHT_OFFSET;

      // Terrain height
      const h = (
        terrain as { getHeightAt?: (x: number, z: number) => number }
      )?.getHeightAt?.(wx, wz);
      return (h ?? 0) + MARKER_HEIGHT_OFFSET;
    };

    // --- Instanced mesh for mid-path tiles ---
    const midCount = Math.max(0, path.length - 2); // exclude first (next) and last (dest)
    if (midCount > 0) {
      // Recreate instanced mesh if count changed
      if (
        !this.pathMesh ||
        this.pathMesh.count !== Math.min(midCount, MAX_MARKERS)
      ) {
        if (this.pathMesh) {
          this.debugGroup.remove(this.pathMesh);
          this.pathMesh.dispose();
        }
        this.pathMesh = new THREE.InstancedMesh(
          this.markerGeometry,
          this.pathMaterial!,
          Math.min(midCount, MAX_MARKERS),
        );
        this.pathMesh.renderOrder = 999;
        this.debugGroup.add(this.pathMesh);
      }

      for (let i = 0; i < Math.min(midCount, MAX_MARKERS); i++) {
        const tile = path[i + 1]; // skip first tile (that's the "next" tile)
        const wp = tileToWorld(tile);
        const y = getY(wp.x, wp.z);
        this._tempMatrix.makeTranslation(wp.x, y, wp.z);
        this.pathMesh.setMatrixAt(i, this._tempMatrix);
      }
      this.pathMesh.instanceMatrix.needsUpdate = true;
      this.pathMesh.visible = true;
    } else if (this.pathMesh) {
      this.pathMesh.visible = false;
    }

    // --- Next tile marker (first tile in path) ---
    if (path.length >= 1) {
      if (!this.nextTileMesh) {
        this.nextTileMesh = new THREE.Mesh(
          this.markerGeometry,
          this.nextTileMaterial!,
        );
        this.nextTileMesh.renderOrder = 999;
        this.debugGroup.add(this.nextTileMesh);
      }
      const wp = tileToWorld(path[0]);
      const y = getY(wp.x, wp.z);
      this.nextTileMesh.position.set(wp.x, y, wp.z);
      this.nextTileMesh.visible = true;
    } else if (this.nextTileMesh) {
      this.nextTileMesh.visible = false;
    }

    // --- Destination marker (last tile in path, if different from next) ---
    if (path.length >= 2) {
      if (!this.destMesh) {
        this.destMesh = new THREE.Mesh(this.markerGeometry, this.destMaterial!);
        this.destMesh.renderOrder = 999;
        this.debugGroup.add(this.destMesh);
      }
      const lastTile = path[path.length - 1];
      const wp = tileToWorld(lastTile);
      const y = getY(wp.x, wp.z);
      this.destMesh.position.set(wp.x, y, wp.z);
      this.destMesh.visible = true;
    } else if (this.destMesh) {
      this.destMesh.visible = false;
    }
  }

  private clearVisualization(): void {
    if (this.pathMesh) {
      this.pathMesh.visible = false;
    }
    if (this.nextTileMesh) {
      this.nextTileMesh.visible = false;
    }
    if (this.destMesh) {
      this.destMesh.visible = false;
    }
    this._lastPathLength = -1;
    this._lastPathFirstX = NaN;
    this._lastPathFirstZ = NaN;
  }

  override destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.handleKeyDown);
    }

    if (this.debugGroup && this.scene) {
      this.scene.remove(this.debugGroup);
    }

    this.pathMesh?.dispose();
    this.nextTileMesh?.geometry?.dispose();
    this.destMesh?.geometry?.dispose();
    this.pathMaterial?.dispose();
    this.nextTileMaterial?.dispose();
    this.destMaterial?.dispose();
    this.markerGeometry?.dispose();

    this.pathMesh = null;
    this.nextTileMesh = null;
    this.destMesh = null;
    this.debugGroup = null;

    super.destroy();
  }
}
