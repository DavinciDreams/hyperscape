/**
 * Pawn — the physical body a PlayerController drives.
 *
 * Mirrors UE5's `APawn` / `ACharacter`: encapsulates a transform and a
 * movement/collision component. Hyperia's `PlayerLocal` is *the* pawn
 * today; future pawn types (e.g. a top-down cursor avatar or an FPS
 * capsule without a visible mesh) can implement this interface to plug
 * into alternate GameModes.
 *
 * Phase 1 scope: structural interface only — the PlayerController and
 * CameraController just need a stable transform reference and a couple
 * of lifecycle hooks.
 *
 * @public
 */

import type { Object3D, Vector3 } from "three";

export interface Pawn {
  /** Unique id — typically the owning player's id. */
  readonly id: string;

  /**
   * Root Three.js object for the pawn (character mesh, VRM rig, etc.).
   * Camera controllers use this as the follow target.
   */
  readonly object: Object3D;

  /**
   * Current world position. Re-read every tick; controllers should not
   * cache it.
   */
  readonly position: Vector3;

  /**
   * Called by the GameMode when a controller takes possession of this
   * pawn. Idempotent.
   */
  possess(): void;

  /**
   * Called when a controller releases the pawn. Idempotent.
   */
  unpossess(): void;
}
