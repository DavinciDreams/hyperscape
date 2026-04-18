/**
 * PIE orbit camera shim.
 *
 * The live client hosts `ClientCameraSystem` (3054 lines, physics-aware
 * follow, cinematic duel overlays, etc.). PIE cannot host that system —
 * it pulls in PhysX, the entity registry, and the full graphics
 * pipeline. Instead, this shim provides the **minimum contract surface**
 * the `OrbitCameraController` needs:
 *
 *   1. Listens for `CAMERA_SET_TARGET` on the PIE world's event bus;
 *      records the pawn supplied.
 *   2. Each `tick(dt)` lerps the editor camera toward a fixed orbit
 *      offset above/behind the pawn's current position, and re-points
 *      the camera at the pawn.
 *
 * The shim is owned by `PlayTestWorld` and torn down in `stop()`.
 * Phase 3 replaces this with a real in-process `ClientCameraSystem`.
 *
 * @internal
 */

import { Vector3, type Camera } from "three";
import type { Pawn } from "../../gameMode/pawns/Pawn";
import { EventType } from "../../types/events";

/** Orbit offset relative to the pawn. Matches Hyperia's default framing. */
const DEFAULT_OFFSET = new Vector3(0, 6, 8);
/** Smoothing factor per second (higher = snappier). */
const FOLLOW_LERP = 8;

interface MinimalEventBus {
  on(type: string, fn: (payload: unknown) => void): void;
  off(type: string, fn: (payload: unknown) => void): void;
}

export class PIEOrbitCameraShim {
  private readonly camera: Camera;
  private readonly bus: MinimalEventBus;
  private target: Pawn | null = null;

  /** Scratch vectors to avoid per-frame allocation. */
  private readonly _desired = new Vector3();
  private readonly _lookAt = new Vector3();

  /** Bound listener kept for removeEventListener symmetry. */
  private readonly _onSetTarget = (payload: unknown): void => {
    const { target } = (payload ?? {}) as { target?: Pawn | null };
    if (target) {
      this.target = target;
    }
  };

  constructor(camera: Camera, bus: MinimalEventBus) {
    this.camera = camera;
    this.bus = bus;
    this.bus.on(EventType.CAMERA_SET_TARGET, this._onSetTarget);
  }

  /**
   * Drive the camera toward the pawn. Safe to call every frame; no-op
   * when no target has been set.
   */
  tick(dt: number): void {
    if (!this.target) return;
    const pos = this.target.position;
    this._desired.set(
      pos.x + DEFAULT_OFFSET.x,
      pos.y + DEFAULT_OFFSET.y,
      pos.z + DEFAULT_OFFSET.z,
    );
    const alpha = Math.min(1, FOLLOW_LERP * dt);
    this.camera.position.lerp(this._desired, alpha);
    this._lookAt.set(pos.x, pos.y, pos.z);
    this.camera.lookAt(this._lookAt);
  }

  /** Diagnostic — tests query this to assert CAMERA_SET_TARGET routed. */
  getTarget(): Pawn | null {
    return this.target;
  }

  /** Detach the event listener. PlayTestWorld calls this in `stop()`. */
  dispose(): void {
    this.bus.off(EventType.CAMERA_SET_TARGET, this._onSetTarget);
    this.target = null;
  }
}
