/**
 * CameraController — owns the scene camera and how it follows/frames
 * the pawn.
 *
 * Mirrors UE5's camera components on the pawn, but lifted out so a
 * GameMode can swap it without touching the pawn class. This is what
 * lets us ship `OrbitCameraController`, `FirstPersonCameraController`,
 * and `FixedAngleCameraController` as drop-in alternatives.
 *
 * Contract guarantees:
 * - `attach(pawn)` is called exactly once before the first `tick()`.
 * - `getCamera()` returns the same Three.js camera instance for the
 *   lifetime of the controller.
 * - `detach()` is called exactly once; after it returns the controller
 *   must not touch the pawn or the camera.
 *
 * Phase 1 scope: interface only.
 *
 * @public
 */

import type { Camera } from "three";
import type { Pawn } from "../pawns/Pawn";

export interface CameraController {
  /**
   * Unique id — e.g. `"orbit"`, `"first-person"`, `"fixed-angle"`.
   */
  readonly id: string;

  /**
   * Bind the camera to a pawn. The pawn's transform is treated as the
   * follow target.
   */
  attach(pawn: Pawn): void;

  /**
   * Per-frame update — typically re-positions the camera relative to
   * the pawn, handles smoothing, and applies zoom/pitch inputs.
   */
  tick(dt: number): void;

  /**
   * Release the pawn reference and stop updating. The underlying
   * Three.js camera may be reused by another controller.
   */
  detach(): void;

  /**
   * The Three.js camera this controller is driving. Stable for the
   * lifetime of the controller.
   */
  getCamera(): Camera;
}
