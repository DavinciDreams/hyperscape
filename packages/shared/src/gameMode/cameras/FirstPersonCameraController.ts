/**
 * FirstPersonCameraController — mouse-look camera anchored to the pawn.
 *
 * Phase 5.2 alternate camera. Runs its own look math locally because
 * `ClientCameraSystem`'s orbit arm is inappropriate for first-person.
 * This controller expects the consumer to ensure `ClientCameraSystem`
 * is either not added to the world or is otherwise not driving
 * `world.camera` — when a first-person manifest resolves, the
 * Hyperia camera stack is dormant.
 *
 * Behavior:
 * - Positions `world.camera` at the pawn's head height (pawn.y + EYE_HEIGHT).
 * - Pointer-lock on click; accumulates mouse deltas into yaw/pitch.
 * - Rotates the pawn's yaw to match the camera so WASD forward is
 *   "the way you're looking."
 *
 * Limitations (documented for Phase 5 scope):
 * - No head-bob, no FOV zoom, no recoil kickback. Drop-in replaceable
 *   by a more specialized FPS camera.
 * - Pitch clamped to ±89° to avoid gimbal flip.
 *
 * @public
 */

import type { Camera } from "three";
import { Euler } from "three";

import type { World } from "../../core/World";
import type { Pawn } from "../pawns/Pawn";
import type { CameraController } from "./CameraController";

export const FIRST_PERSON_CAMERA_CONTROLLER_ID = "first-person";

/** Height of the camera above the pawn's origin, in world units. */
const EYE_HEIGHT = 1.7;
/** Mouse sensitivity — radians per pixel. */
const MOUSE_SENSITIVITY = 0.0022;
/** Pitch clamp, radians (≈ ±89°). */
const PITCH_MAX = Math.PI / 2 - 0.01;

export class FirstPersonCameraController implements CameraController {
  readonly id = FIRST_PERSON_CAMERA_CONTROLLER_ID;

  private readonly world: World;
  private pawn: Pawn | null = null;
  private attached = false;

  /** Accumulated yaw (around Y) in radians. */
  private yaw = 0;
  /** Accumulated pitch (around X) in radians. */
  private pitch = 0;

  /** Reused Euler for camera orientation write. */
  private readonly _euler = new Euler(0, 0, 0, "YXZ");

  constructor(world: World) {
    this.world = world;
  }

  private readonly onMouseMove = (e: MouseEvent): void => {
    // Only act while pointer is locked to avoid stealing mouse input
    // from the browser chrome.
    if (typeof document !== "undefined" && document.pointerLockElement) {
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * MOUSE_SENSITIVITY;
      if (this.pitch > PITCH_MAX) this.pitch = PITCH_MAX;
      if (this.pitch < -PITCH_MAX) this.pitch = -PITCH_MAX;
    }
  };

  private readonly onRequestLock = (): void => {
    // Callers hold responsibility for pointer-lock UX; we only hook up
    // the listener to request it on a viewport click.
    const el = (this.world as unknown as { viewport?: HTMLElement }).viewport;
    if (el && typeof el.requestPointerLock === "function") {
      el.requestPointerLock();
    }
  };

  attach(pawn: Pawn): void {
    if (this.attached) {
      return;
    }
    this.pawn = pawn;
    this.yaw = 0;
    this.pitch = 0;

    if (typeof window !== "undefined") {
      window.addEventListener("mousemove", this.onMouseMove);
      window.addEventListener("click", this.onRequestLock);
    }
    this.attached = true;
  }

  tick(_dt: number): void {
    if (!this.pawn || !this.attached) {
      return;
    }
    const camera = this.world.camera;
    // Camera position: pawn position + eye-height offset.
    camera.position.set(
      this.pawn.object.position.x,
      this.pawn.object.position.y + EYE_HEIGHT,
      this.pawn.object.position.z,
    );
    // Camera orientation: yaw+pitch in YXZ order (yaw applied first).
    this._euler.set(this.pitch, this.yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(this._euler);

    // Rotate the pawn's yaw so locomotion controllers (e.g. WASD) move
    // in the direction the camera is facing. Pitch is camera-only —
    // the pawn's torso stays upright.
    this.pawn.object.rotation.y = this.yaw;
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("mousemove", this.onMouseMove);
      window.removeEventListener("click", this.onRequestLock);
    }
    if (
      typeof document !== "undefined" &&
      document.pointerLockElement &&
      typeof document.exitPointerLock === "function"
    ) {
      document.exitPointerLock();
    }
    this.pawn = null;
    this.attached = false;
  }

  getCamera(): Camera {
    return this.world.camera;
  }
}
