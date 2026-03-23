/**
 * WalkableTileDebugSystem — color-coded overlay of collision flags on every tile
 * around the player.
 *
 * Shows:
 *   Green  — walkable (no blocking flags)
 *   Blue   — water
 *   Brown  — bridge
 *   Teal   — dock
 *   Yellow — steep slope
 *   Red    — blocked (object / full tile)
 *   Orange — wall edges (cardinal, drawn as thin strips on tile borders)
 *
 * Toggle: Press 'W' when F5 panel is visible, or console:
 *   world.walkableDebug.toggle()
 *   world.walkableDebug.setRadius(15)
 *
 * @client-only
 */

import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { System } from "../shared/infrastructure/System";
import type { World } from "../../core/World";
import {
  CollisionFlag,
  CollisionMask,
} from "../shared/movement/CollisionFlags";
import type { TerrainSystem } from "../shared/world/TerrainSystem";
import type { BridgeSystem } from "../shared/world/BridgeSystem";

// ── Category colors ──
const COLOR_WALKABLE = 0x22cc44; // Green
const COLOR_WATER = 0x2288ff; // Blue
const COLOR_BRIDGE = 0xcc8833; // Brown
const COLOR_DOCK = 0x33bbaa; // Teal
const COLOR_STEEP = 0xddcc22; // Yellow
const COLOR_BLOCKED = 0xdd3333; // Red
const COLOR_WALL = 0xff8800; // Orange (wall edge strips)

type TileCategory =
  | "walkable"
  | "water"
  | "bridge"
  | "dock"
  | "steep"
  | "blocked";

const CATEGORY_COLORS: Record<TileCategory, number> = {
  walkable: COLOR_WALKABLE,
  water: COLOR_WATER,
  bridge: COLOR_BRIDGE,
  dock: COLOR_DOCK,
  steep: COLOR_STEEP,
  blocked: COLOR_BLOCKED,
};

const MAX_INSTANCES = 2000;
const MAX_WALL_INSTANCES = 2000;
const TILE_SIZE = 1;
const MARKER_Y_OFFSET = 0.06;

export class WalkableTileDebugSystem extends System {
  private enabled = false;
  private scene: THREE.Scene | null = null;
  private debugGroup: THREE.Group | null = null;

  // Tile plane geometry (pre-rotated to XZ)
  private tileGeometry: THREE.PlaneGeometry | null = null;
  // Wall strip geometry — thin rectangle for wall edge indicators
  private wallGeometry: THREE.PlaneGeometry | null = null;

  // Per-category instanced meshes
  private meshes = new Map<TileCategory, THREE.InstancedMesh>();
  private meshCounts = new Map<TileCategory, number>();
  // Wall edge instanced mesh (single color, all directions)
  private wallMesh: THREE.InstancedMesh | null = null;
  private wallCount = 0;

  // Materials
  private materials = new Map<TileCategory, MeshBasicNodeMaterial>();
  private wallMaterial: MeshBasicNodeMaterial | null = null;

  // Change detection
  private lastPlayerTileX = NaN;
  private lastPlayerTileZ = NaN;
  private lastUpdateTime = 0;
  private updateInterval = 150; // ms

  private radius = 12;

  // Reusable
  private _mat = new THREE.Matrix4();
  private _pos = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _scale = new THREE.Vector3(1, 1, 1);
  private _flatQuat = new THREE.Quaternion();
  private _flatAxis = new THREE.Vector3();

  // Info overlay
  private infoDiv: HTMLDivElement | null = null;

  constructor(world: World) {
    super(world);
  }

  async start(): Promise<void> {
    this.scene = this.world.stage?.scene ?? null;

    // Tile plane — 0.92 × 0.92 to leave small gaps between tiles
    this.tileGeometry = new THREE.PlaneGeometry(
      TILE_SIZE * 0.92,
      TILE_SIZE * 0.92,
    );
    this.tileGeometry.rotateX(-Math.PI / 2);

    // Wall strip — thin strip for edge indicators (long side = tile edge, short = 0.08m)
    this.wallGeometry = new THREE.PlaneGeometry(TILE_SIZE * 0.9, 0.08);
    // Don't rotate — we'll orient per-instance via matrix

    // Create materials for each category
    for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
      const mat = new MeshBasicNodeMaterial();
      mat.color = new THREE.Color(color);
      mat.transparent = true;
      mat.opacity = 0.4;
      mat.depthWrite = false;
      mat.side = THREE.DoubleSide;
      this.materials.set(cat as TileCategory, mat);
    }

    // Wall material
    this.wallMaterial = new MeshBasicNodeMaterial();
    this.wallMaterial.color = new THREE.Color(COLOR_WALL);
    this.wallMaterial.transparent = true;
    this.wallMaterial.opacity = 0.7;
    this.wallMaterial.depthWrite = false;
    this.wallMaterial.side = THREE.DoubleSide;

    // Create instanced meshes
    this.createMeshes();

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.handleKeyDown);
    }

    (this.world as { walkableDebug?: WalkableTileDebugSystem }).walkableDebug =
      this;

    console.log(
      "[WalkableDebug] Ready — Press 'W' (with F5 open) to toggle tile overlay",
    );
  }

  private createMeshes(): void {
    if (!this.tileGeometry || !this.wallGeometry) return;

    this.debugGroup = new THREE.Group();
    this.debugGroup.name = "walkable-tile-debug";
    this.debugGroup.renderOrder = 998;
    this.debugGroup.visible = false;

    for (const cat of Object.keys(CATEGORY_COLORS) as TileCategory[]) {
      const mat = this.materials.get(cat)!;
      const mesh = new THREE.InstancedMesh(
        this.tileGeometry,
        mat,
        MAX_INSTANCES,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 998;
      mesh.count = 0;
      this.meshes.set(cat, mesh);
      this.meshCounts.set(cat, 0);
      this.debugGroup.add(mesh);
    }

    // Wall edges
    this.wallMesh = new THREE.InstancedMesh(
      this.wallGeometry,
      this.wallMaterial!,
      MAX_WALL_INSTANCES,
    );
    this.wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wallMesh.frustumCulled = false;
    this.wallMesh.renderOrder = 999;
    this.wallMesh.count = 0;
    this.debugGroup.add(this.wallMesh);

    this.scene?.add(this.debugGroup);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    if (
      (e.key === "w" || e.key === "W") &&
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
    console.log(`[WalkableDebug] ${enabled ? "ENABLED" : "DISABLED"}`);
    if (this.debugGroup) {
      this.debugGroup.visible = enabled;
    }
    if (enabled) {
      this.lastPlayerTileX = NaN; // Force rebuild
      this.createInfoOverlay();
    } else if (this.infoDiv) {
      this.infoDiv.style.display = "none";
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setRadius(r: number): void {
    this.radius = Math.max(3, Math.min(r, 25));
    console.log(`[WalkableDebug] Radius set to ${this.radius}`);
    this.lastPlayerTileX = NaN; // Force rebuild
  }

  override update(_deltaTime: number): void {
    if (!this.enabled) return;

    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateInterval) return;

    const player = this.world.getPlayer?.();
    if (!player) return;
    const pos = player.position || { x: 0, z: 0 };
    const tx = Math.floor(pos.x);
    const tz = Math.floor(pos.z);

    if (tx === this.lastPlayerTileX && tz === this.lastPlayerTileZ) return;

    this.lastPlayerTileX = tx;
    this.lastPlayerTileZ = tz;
    this.lastUpdateTime = now;
    this.rebuild(tx, tz);
    this.updateInfoOverlay(tx, tz);
  }

  // ── Rebuild all instances around (cx, cz) ──
  private rebuild(cx: number, cz: number): void {
    // Reset counts
    for (const cat of this.meshes.keys()) {
      this.meshCounts.set(cat, 0);
    }
    this.wallCount = 0;

    const collision = this.world.collision as {
      getFlags: (x: number, z: number) => number;
    } | null;
    if (!collision) return;
    const terrain = this.world.getSystem("terrain") as TerrainSystem | null;
    const bridge = this.world.getSystem("bridges") as BridgeSystem | null;

    const r = this.radius;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const tileX = cx + dx;
        const tileZ = cz + dz;
        const flags = collision.getFlags(tileX, tileZ);

        // Determine Y
        let y = MARKER_Y_OFFSET;
        const deckH = bridge?.getDeckHeightAt(tileX, tileZ);
        if (deckH !== null && deckH !== undefined) {
          y = deckH + MARKER_Y_OFFSET;
        } else {
          const h = (
            terrain as { getHeightAt?: (x: number, z: number) => number }
          )?.getHeightAt?.(tileX + 0.5, tileZ + 0.5);
          if (h !== undefined && h !== null && Number.isFinite(h)) {
            y = h + MARKER_Y_OFFSET;
          }
        }

        // Categorize
        let cat: TileCategory;
        if (flags & CollisionFlag.BRIDGE) {
          cat = "bridge";
        } else if (flags & CollisionFlag.DOCK) {
          cat = "dock";
        } else if (flags & CollisionFlag.WATER) {
          cat = "water";
        } else if (flags & CollisionFlag.STEEP_SLOPE) {
          cat = "steep";
        } else if (flags & CollisionFlag.BLOCKED) {
          cat = "blocked";
        } else {
          cat = "walkable";
        }

        this.addTileInstance(cat, tileX + 0.5, y, tileZ + 0.5);

        // Wall edge indicators (cardinal only for readability)
        const wallY = y + 0.02;
        if (flags & CollisionFlag.WALL_NORTH) {
          this.addWallInstance(tileX + 0.5, wallY, tileZ, 0); // north edge
        }
        if (flags & CollisionFlag.WALL_SOUTH) {
          this.addWallInstance(tileX + 0.5, wallY, tileZ + 1, 0); // south edge
        }
        if (flags & CollisionFlag.WALL_EAST) {
          this.addWallInstance(tileX + 1, wallY, tileZ + 0.5, Math.PI / 2); // east edge
        }
        if (flags & CollisionFlag.WALL_WEST) {
          this.addWallInstance(tileX, wallY, tileZ + 0.5, Math.PI / 2); // west edge
        }
      }
    }

    // Commit counts
    for (const [cat, mesh] of this.meshes) {
      mesh.count = this.meshCounts.get(cat) ?? 0;
      if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.wallMesh) {
      this.wallMesh.count = this.wallCount;
      if (this.wallCount > 0) this.wallMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private addTileInstance(
    cat: TileCategory,
    x: number,
    y: number,
    z: number,
  ): void {
    const mesh = this.meshes.get(cat);
    const count = this.meshCounts.get(cat) ?? 0;
    if (!mesh || count >= MAX_INSTANCES) return;

    this._mat.makeTranslation(x, y, z);
    mesh.setMatrixAt(count, this._mat);
    this.meshCounts.set(cat, count + 1);
  }

  private addWallInstance(x: number, y: number, z: number, rotY: number): void {
    if (!this.wallMesh || this.wallCount >= MAX_WALL_INSTANCES) return;

    // Wall strips lie flat on XZ, rotated around Y for east/west edges
    this._quat.setFromAxisAngle(this._pos.set(0, 1, 0), rotY);
    // Also rotate to lie flat (plane default is XY, we need XZ)
    this._flatQuat.setFromAxisAngle(this._flatAxis.set(1, 0, 0), -Math.PI / 2);
    this._quat.multiply(this._flatQuat);

    this._mat.compose(this._pos.set(x, y, z), this._quat, this._scale);
    this.wallMesh.setMatrixAt(this.wallCount, this._mat);
    this.wallCount++;
  }

  // ── Info overlay (legend) ──
  private createInfoOverlay(): void {
    if (this.infoDiv) {
      this.infoDiv.style.display = "block";
      return;
    }

    this.infoDiv = document.createElement("div");
    this.infoDiv.id = "walkable-debug-info";
    this.infoDiv.style.cssText = `
      position: fixed;
      bottom: 12px;
      left: 12px;
      background: rgba(10, 10, 15, 0.9);
      border: 1px solid rgba(100, 200, 255, 0.2);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 10px;
      color: #ccc;
      z-index: 99998;
      pointer-events: none;
      line-height: 1.5;
    `;
    document.body.appendChild(this.infoDiv);
  }

  private updateInfoOverlay(tx: number, tz: number): void {
    if (!this.infoDiv) return;

    const collision = this.world.collision as {
      getFlags: (x: number, z: number) => number;
    };
    const flags = collision.getFlags(tx, tz);
    const parts: string[] = [];
    if (flags & CollisionFlag.BRIDGE) parts.push("BRIDGE");
    if (flags & CollisionFlag.DOCK) parts.push("DOCK");
    if (flags & CollisionFlag.WATER) parts.push("WATER");
    if (flags & CollisionFlag.STEEP_SLOPE) parts.push("STEEP");
    if (flags & CollisionFlag.BLOCKED) parts.push("BLOCKED");
    if (flags & CollisionMask.WALLS) parts.push("WALL");
    if (parts.length === 0) parts.push("WALKABLE");

    this.infoDiv.innerHTML = `
      <div style="color:rgba(100,200,255,0.7);font-size:9px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Walkable Tiles (W)</div>
      <span style="color:#${COLOR_WALKABLE.toString(16).padStart(6, "0")}">&#9632;</span> Walkable
      <span style="color:#${COLOR_WATER.toString(16).padStart(6, "0")}">&#9632;</span> Water
      <span style="color:#${COLOR_BRIDGE.toString(16).padStart(6, "0")}">&#9632;</span> Bridge
      <span style="color:#${COLOR_DOCK.toString(16).padStart(6, "0")}">&#9632;</span> Dock<br>
      <span style="color:#${COLOR_STEEP.toString(16).padStart(6, "0")}">&#9632;</span> Steep
      <span style="color:#${COLOR_BLOCKED.toString(16).padStart(6, "0")}">&#9632;</span> Blocked
      <span style="color:#${COLOR_WALL.toString(16).padStart(6, "0")}">&#9632;</span> Wall Edge<br>
      <span style="color:#888">Tile (${tx}, ${tz}): <span style="color:#e2e8f0">${parts.join(" | ")}</span> [0x${flags.toString(16)}]</span><br>
      <span style="color:#555">Radius: ${this.radius} — world.walkableDebug.setRadius(n)</span>
    `;
  }

  override destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.handleKeyDown);
    }
    if (this.debugGroup && this.scene) {
      this.scene.remove(this.debugGroup);
    }
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.wallMesh?.dispose();
    for (const mat of this.materials.values()) mat.dispose();
    this.wallMaterial?.dispose();
    this.tileGeometry?.dispose();
    this.wallGeometry?.dispose();
    if (this.infoDiv) this.infoDiv.remove();

    this.meshes.clear();
    this.materials.clear();
    this.debugGroup = null;
    this.wallMesh = null;
    this.infoDiv = null;

    super.destroy();
  }
}
