/**
 * WASDPlayerController — keyboard-driven movement for non-Hyperscape games.
 *
 * Phase 5.1 alternate controller. Kinematic: reads WASD (plus Shift to
 * run, Space to jump) and writes directly to `pawn.object.position`.
 * Does NOT consult `InteractionRouter`, `ClientCameraSystem`, or
 * `PlayerLocal` — this is a parallel, opt-in code path.
 *
 * **Invariant:** when this controller is attached, the Hyperscape
 * click-to-walk stack is dormant (a different GameMode was selected).
 * Swapping between the two is a per-game manifest change, not a
 * runtime mode toggle inside one game.
 *
 * Limitations (documented for Phase 5 scope):
 * - Kinematic motion — ignores PhysX collisions. For humanoid games
 *   that need them, a future pawn can wrap PlayerLocal's character
 *   controller and expose a `move(vec)` method the controller calls
 *   instead of mutating the Object3D.
 * - Movement is in the XZ plane; Y comes from `pawn.object.position.y`
 *   (whatever set it). Gravity/jump are not simulated; a jump becomes
 *   a one-shot vertical impulse that decays over ~600 ms.
 *
 * @public
 */

import { Vector3 } from "three";

import type { World } from "../../core/World";
import type { InputContext } from "../input/InputContext";
import type { Pawn } from "../pawns/Pawn";
import type { PlayerController } from "./PlayerController";

export const WASD_CONTROLLER_ID = "wasd";

/** Walking speed in world-units per second. */
const WALK_SPEED = 4;
/** Running multiplier applied while the Run action is held. */
const RUN_MULTIPLIER = 2;
/** Vertical impulse applied on jump, in world-units per second. */
const JUMP_IMPULSE = 5;
/** Gravity applied to the jump impulse, in world-units per second^2. */
const GRAVITY = 18;

type TrackedKey = "KeyW" | "KeyA" | "KeyS" | "KeyD" | "ShiftLeft" | "Space";

export class WASDPlayerController implements PlayerController {
  readonly id = WASD_CONTROLLER_ID;

  private readonly world: World;
  private pawn: Pawn | null = null;
  private input: InputContext | null = null;
  private attached = false;

  /** Currently-held keys. Mutated by the keydown/keyup listeners. */
  private readonly keys: Set<TrackedKey> = new Set();

  /** Vertical velocity applied by jumps; zero when grounded. */
  private verticalVelocity = 0;
  /** Baseline Y at attach time — treated as the ground plane for jumps. */
  private groundY = 0;

  constructor(world: World) {
    this.world = world;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isTrackedKey(e.code)) {
      this.keys.add(e.code);
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (isTrackedKey(e.code)) {
      this.keys.delete(e.code);
    }
  };

  attach(pawn: Pawn, input: InputContext): void {
    if (this.attached) {
      return;
    }
    this.pawn = pawn;
    this.input = input;
    this.groundY = pawn.object.position.y;
    this.verticalVelocity = 0;

    input.activate(this.world);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.onKeyDown);
      window.addEventListener("keyup", this.onKeyUp);
    }

    pawn.possess();
    this.attached = true;
  }

  tick(dt: number): void {
    if (!this.pawn || !this.attached) {
      return;
    }

    // Horizontal movement vector in local XZ. +Z (forward) follows the
    // Three.js convention that -Z is "forward" relative to a default
    // camera facing; we flip so KeyW moves toward where the pawn is
    // looking.
    const forward =
      (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const strafe =
      (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);

    const speed =
      WALK_SPEED * (this.keys.has("ShiftLeft") ? RUN_MULTIPLIER : 1);

    if (forward !== 0 || strafe !== 0) {
      // Build the local move vector and rotate by pawn yaw so W follows
      // the pawn's facing. Normalize first so diagonals don't exceed
      // `speed`.
      const move = _tmpMove.set(strafe, 0, -forward);
      move.normalize().multiplyScalar(speed * dt);
      move.applyQuaternion(this.pawn.object.quaternion);
      this.pawn.object.position.x += move.x;
      this.pawn.object.position.z += move.z;
    }

    // Jump: if grounded and Space is pressed, apply an impulse.
    const grounded =
      this.pawn.object.position.y <= this.groundY + 0.001 &&
      this.verticalVelocity <= 0;
    if (grounded && this.keys.has("Space")) {
      this.verticalVelocity = JUMP_IMPULSE;
    }

    // Integrate vertical velocity with gravity.
    if (!grounded || this.verticalVelocity > 0) {
      this.verticalVelocity -= GRAVITY * dt;
      this.pawn.object.position.y += this.verticalVelocity * dt;
      if (this.pawn.object.position.y <= this.groundY) {
        this.pawn.object.position.y = this.groundY;
        this.verticalVelocity = 0;
      }
    }
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("keyup", this.onKeyUp);
    }
    this.keys.clear();
    this.verticalVelocity = 0;
    if (this.input) {
      this.input.deactivate(this.world);
    }
    if (this.pawn) {
      this.pawn.unpossess();
    }
    this.input = null;
    this.pawn = null;
    this.attached = false;
  }
}

function isTrackedKey(code: string): code is TrackedKey {
  return (
    code === "KeyW" ||
    code === "KeyA" ||
    code === "KeyS" ||
    code === "KeyD" ||
    code === "ShiftLeft" ||
    code === "Space"
  );
}

/** Preallocated movement vector — avoids per-frame GC in `tick()`. */
const _tmpMove = new Vector3();
