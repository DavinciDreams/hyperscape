/**
 * PIE interaction router shim.
 *
 * Substitute for the live client's `InteractionRouter` (16 registered
 * handlers, raycast + server-intent routing) inside PIE. The real router
 * depends on the client network stack and entity registry; PIE has
 * neither. This shim exposes just enough for
 * `ClickToWalkPlayerController.getInteractionRouter()` to return a
 * non-null reference and for the PIE viewport to route ground clicks
 * into a move-intent the pawn advances toward.
 *
 * Flow on viewport `pointerdown`:
 *   1. Compute NDC from client rect.
 *   2. Raycast against a horizontal plane at `groundY` (pawn's current y).
 *   3. Record the hit as the move target.
 *   4. Emit `player:intent:move-to` on the PIE event bus for observers.
 *
 * Each `tick(dt)` lerps the pawn's `object.position` toward the recorded
 * target at `WALK_SPEED`; clears the target when within `ARRIVAL_EPS`.
 *
 * Phase 3 replaces this with the real `InteractionRouter` running
 * against an in-process client World; this shim is throwaway scaffolding.
 *
 * @internal
 */

import { Plane, Raycaster, Vector2, Vector3, type Camera } from "three";
import type { Pawn } from "../../gameMode/pawns/Pawn";

const WALK_SPEED = 4; // units/sec — matches WASD controller for consistency
const ARRIVAL_EPS = 0.1;

interface MinimalEventBus {
  emit(type: string, payload: unknown): void;
}

export interface PIEInteractionRouterShimOptions {
  viewport: HTMLElement;
  camera: Camera;
  bus: MinimalEventBus;
}

export class PIEInteractionRouterShim {
  private readonly viewport: HTMLElement;
  private readonly camera: Camera;
  private readonly bus: MinimalEventBus;
  private pawn: Pawn | null = null;
  private moveTarget: Vector3 | null = null;

  private readonly raycaster = new Raycaster();
  private readonly _ndc = new Vector2();
  private readonly _hit = new Vector3();
  private readonly _plane = new Plane(new Vector3(0, 1, 0), 0);

  private readonly _onPointerDown = (evt: PointerEvent): void => {
    if (evt.button !== 0) return;
    if (!this.pawn) return;
    const rect = this.viewport.getBoundingClientRect();
    this._ndc.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this._ndc, this.camera);
    // Plane at the pawn's current y so clicks land on the logical floor
    // the pawn walks on (no terrain sampling — PIE is flat ground).
    this._plane.constant = -this.pawn.position.y;
    if (this.raycaster.ray.intersectPlane(this._plane, this._hit)) {
      this.moveTarget = this._hit.clone();
      this.bus.emit("player:intent:move-to", {
        pawnId: this.pawn.id,
        target: { x: this._hit.x, y: this._hit.y, z: this._hit.z },
      });
    }
  };

  constructor(opts: PIEInteractionRouterShimOptions) {
    this.viewport = opts.viewport;
    this.camera = opts.camera;
    this.bus = opts.bus;
    this.viewport.addEventListener("pointerdown", this._onPointerDown);
  }

  /** Called by `ClickToWalkPlayerController.attach()` through the controller's
   * diagnostic chain, and explicitly by PlayTestWorld.start after construction. */
  setPawn(pawn: Pawn): void {
    this.pawn = pawn;
  }

  /** Advance the pawn toward the recorded move target. */
  tick(dt: number): void {
    if (!this.pawn || !this.moveTarget) return;
    const pos = this.pawn.position;
    const dx = this.moveTarget.x - pos.x;
    const dz = this.moveTarget.z - pos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq <= ARRIVAL_EPS * ARRIVAL_EPS) {
      this.moveTarget = null;
      return;
    }
    const dist = Math.sqrt(distSq);
    const step = Math.min(WALK_SPEED * dt, dist);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
  }

  /** Diagnostic — tests + PIE toolbar inspect routing state. */
  getPawn(): Pawn | null {
    return this.pawn;
  }
  getMoveTarget(): Vector3 | null {
    return this.moveTarget;
  }

  dispose(): void {
    this.viewport.removeEventListener("pointerdown", this._onPointerDown);
    this.pawn = null;
    this.moveTarget = null;
  }
}
