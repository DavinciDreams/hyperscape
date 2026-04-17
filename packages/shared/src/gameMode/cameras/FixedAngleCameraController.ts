/**
 * FixedAngleCameraController — fixed pitch/zoom overhead camera.
 *
 * Phase 5.3 alternate camera. Pairs with `TopDownPlayerController` to
 * produce a Diablo-like feel: the camera hovers at a constant offset
 * above the pawn, always looking down at it. No rotation, no zoom.
 *
 * Controllers that want a rotatable or zoomable top-down camera should
 * subclass this or write a sibling controller; the Phase 5 acceptance
 * criterion is "prove the controller/camera split is meaningful," not
 * "ship a full top-down camera suite."
 *
 * @public
 */

import type { Camera } from "three";
import { Vector3 } from "three";

import type { World } from "../../core/World";
import type { Pawn } from "../pawns/Pawn";
import type { CameraController } from "./CameraController";

export const FIXED_ANGLE_CAMERA_CONTROLLER_ID = "fixed-angle";

export interface FixedAngleOptions {
  /** Camera offset from the pawn in world units. Default: (0, 12, 10). */
  offset?: Vector3;
}

const DEFAULT_OFFSET = new Vector3(0, 12, 10);

export class FixedAngleCameraController implements CameraController {
  readonly id = FIXED_ANGLE_CAMERA_CONTROLLER_ID;

  private readonly world: World;
  private readonly offset: Vector3;
  private pawn: Pawn | null = null;
  private attached = false;

  private readonly _lookTarget = new Vector3();

  constructor(world: World, options: FixedAngleOptions = {}) {
    this.world = world;
    this.offset = options.offset
      ? options.offset.clone()
      : DEFAULT_OFFSET.clone();
  }

  attach(pawn: Pawn): void {
    if (this.attached) {
      return;
    }
    this.pawn = pawn;
    this.attached = true;
  }

  tick(_dt: number): void {
    if (!this.pawn || !this.attached) {
      return;
    }
    const camera = this.world.camera;
    const pos = this.pawn.object.position;
    camera.position.set(
      pos.x + this.offset.x,
      pos.y + this.offset.y,
      pos.z + this.offset.z,
    );
    this._lookTarget.copy(pos);
    camera.lookAt(this._lookTarget);
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
    this.pawn = null;
    this.attached = false;
  }

  getCamera(): Camera {
    return this.world.camera;
  }
}
