/**
 * TopDownPlayerController — click-to-move with a fixed-angle camera.
 *
 * Phase 5.3 alternate controller. Mirrors the click-intent shape of
 * `ClickToWalkPlayerController` but NEVER touches `InteractionRouter`;
 * it owns its own canvas click listener, raycasts the ground plane at
 * y = `groundY`, and walks the pawn toward the hit at a constant speed.
 *
 * Pair this controller with `FixedAngleCameraController` for a
 * Diablo-like overhead feel, or with any other `CameraController` — the
 * controller is camera-agnostic.
 *
 * Limitations (documented for Phase 5 scope):
 * - Ground-plane raycast only (no terrain probe); assumes the playable
 *   area is approximately flat. Games with varied terrain can supply a
 *   custom raycast via a future `TopDownOptions.hitPlane` option.
 * - Kinematic — writes directly to `pawn.object.position`.
 *
 * @public
 */

import { Vector2, Vector3, Raycaster, Plane } from "three";

import type { World } from "../../core/World";
import type { InputContext } from "../input/InputContext";
import type { Pawn } from "../pawns/Pawn";
import type { PlayerController } from "./PlayerController";

export const TOP_DOWN_CONTROLLER_ID = "top-down";

/** Movement speed in world-units per second. */
const WALK_SPEED = 5;
/** Distance below which the pawn considers the target "reached." */
const ARRIVE_EPSILON = 0.05;

export class TopDownPlayerController implements PlayerController {
  readonly id = TOP_DOWN_CONTROLLER_ID;

  private readonly world: World;
  private pawn: Pawn | null = null;
  private input: InputContext | null = null;
  private attached = false;

  /** Current movement target in world space, or null when idle. */
  private target: Vector3 | null = null;
  /** Ground Y baked at attach time; click raycasts hit this plane. */
  private groundY = 0;

  /** Reused scratch vectors. */
  private readonly _ndc = new Vector2();
  private readonly _raycaster = new Raycaster();
  private readonly _plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly _hit = new Vector3();
  private readonly _delta = new Vector3();

  constructor(world: World) {
    this.world = world;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return; // Left click only.
    if (!this.pawn) return;
    const viewport = (this.world as unknown as { viewport?: HTMLElement })
      .viewport;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    this._ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    // Raycaster.setFromCamera uses the camera's projection matrix; we
    // re-fix the ground plane each click in case the pawn drifted off
    // the baked `groundY`.
    this._plane.constant = -this.groundY;
    this._raycaster.setFromCamera(this._ndc, this.world.camera);
    const hit = this._raycaster.ray.intersectPlane(this._plane, this._hit);
    if (hit) {
      this.target = this.target ?? new Vector3();
      this.target.copy(hit);
    }
  };

  attach(pawn: Pawn, input: InputContext): void {
    if (this.attached) {
      return;
    }
    this.pawn = pawn;
    this.input = input;
    this.groundY = pawn.object.position.y;
    this.target = null;

    input.activate(this.world);
    const viewport = (this.world as unknown as { viewport?: HTMLElement })
      .viewport;
    if (viewport) {
      viewport.addEventListener("pointerdown", this.onPointerDown);
    }

    pawn.possess();
    this.attached = true;
  }

  tick(dt: number): void {
    if (!this.pawn || !this.attached || !this.target) {
      return;
    }
    const pos = this.pawn.object.position;
    this._delta.set(this.target.x - pos.x, 0, this.target.z - pos.z);
    const dist = this._delta.length();
    if (dist < ARRIVE_EPSILON) {
      this.target = null;
      return;
    }
    const step = Math.min(dist, WALK_SPEED * dt);
    this._delta.normalize().multiplyScalar(step);
    pos.x += this._delta.x;
    pos.z += this._delta.z;
    // Face the direction of motion. atan2 maps our forward (-Z) into yaw.
    this.pawn.object.rotation.y =
      Math.atan2(this._delta.x, this._delta.z) + Math.PI;
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
    const viewport = (this.world as unknown as { viewport?: HTMLElement })
      .viewport;
    if (viewport) {
      viewport.removeEventListener("pointerdown", this.onPointerDown);
    }
    if (this.input) {
      this.input.deactivate(this.world);
    }
    if (this.pawn) {
      this.pawn.unpossess();
    }
    this.target = null;
    this.input = null;
    this.pawn = null;
    this.attached = false;
  }
}
