/**
 * OrbitCameraController — Hyperscape's default camera.
 *
 * Phase 2 is a *facade*: the real orbit + follow + cinematic-duel logic
 * lives in `ClientCameraSystem` (3054 lines). This controller exposes
 * the engine's existing camera under the GameMode contract so alternate
 * cameras (first-person, fixed-angle) can plug in later without
 * renaming call sites.
 *
 * Lifecycle:
 * - `attach(pawn)` sets the pawn as the camera target via the existing
 *   `CAMERA_SET_TARGET` event path (same route PlayerInputHandler uses).
 *   It does NOT mutate ClientCameraSystem state directly.
 * - `tick(dt)` is a no-op. ClientCameraSystem runs its own update loop.
 * - `detach()` drops the pawn reference; the ClientCameraSystem keeps
 *   its last target until another controller attaches. This matches the
 *   existing PlayerLocal teardown behavior (no clear-target emit).
 * - `getCamera()` returns `world.camera` — there's exactly one scene
 *   camera and ClientCameraSystem drives it.
 *
 * Cinematic duel camera is an overlay inside ClientCameraSystem and is
 * NOT re-exposed here; it's a specialized mode, not a GameMode swap.
 *
 * @public
 */

import type { Camera } from "three";
import type { World } from "../../core/World";
import { EventType } from "../../types/events";
import type { Pawn } from "../pawns/Pawn";
import type { CameraController } from "./CameraController";

export const ORBIT_CAMERA_CONTROLLER_ID = "orbit";

export class OrbitCameraController implements CameraController {
  readonly id = ORBIT_CAMERA_CONTROLLER_ID;

  private world: World;
  private pawn: Pawn | null = null;
  private attached = false;

  constructor(world: World) {
    this.world = world;
  }

  attach(pawn: Pawn): void {
    if (this.attached) {
      return;
    }
    this.pawn = pawn;
    // Route through the existing CAMERA_SET_TARGET event so the
    // engine's camera system treats this the same as PlayerLocal's
    // native targeting. Zero behavior change.
    this.world.emit(EventType.CAMERA_SET_TARGET, { target: pawn });
    this.attached = true;
  }

  tick(_dt: number): void {
    // ClientCameraSystem handles its own per-frame update.
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
    // Intentionally do NOT emit CAMERA_SET_TARGET with null — the event
    // payload doesn't accept null and the existing ClientCameraSystem
    // retains its last target until another one is set. This matches
    // the Hyperscape teardown behavior today.
    this.pawn = null;
    this.attached = false;
  }

  getCamera(): Camera {
    return this.world.camera;
  }
}
