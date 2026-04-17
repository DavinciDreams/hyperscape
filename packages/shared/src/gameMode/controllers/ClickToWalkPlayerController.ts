/**
 * ClickToWalkPlayerController — Hyperscape's default controller.
 *
 * Phase 2 is a *facade*: the real raycast + server-intent routing still
 * lives in `InteractionRouter` (27-file surface, 16 registered
 * interaction handlers). This controller exposes the semantic to the
 * GameMode contract so PIE and future alternate modes can ask "what
 * controller does this game use?" without reaching into engine internals.
 *
 * Phase 3 will route PIE through this class. Phase 5 will use this as
 * the reference implementation when landing `WASDPlayerController`.
 *
 * Lifecycle:
 * - `attach(pawn, input)` records the pawn + input for later phases and
 *   activates the input context. It does NOT re-bind InteractionRouter —
 *   the router's constructor already runs inside `createClientWorld`.
 * - `tick(dt)` is a no-op. InteractionRouter runs its own update loop
 *   through the `System` base class.
 * - `detach()` deactivates the input context and drops references.
 *
 * @public
 */

import type { World } from "../../core/World";
import { getSystem } from "../../utils/SystemUtils";
import type { InputContext } from "../input/InputContext";
import type { Pawn } from "../pawns/Pawn";
import type { PlayerController } from "./PlayerController";

export const CLICK_TO_WALK_CONTROLLER_ID = "click-to-walk";

export class ClickToWalkPlayerController implements PlayerController {
  readonly id = CLICK_TO_WALK_CONTROLLER_ID;

  private world: World;
  private pawn: Pawn | null = null;
  private input: InputContext | null = null;
  private attached = false;

  constructor(world: World) {
    this.world = world;
  }

  attach(pawn: Pawn, input: InputContext): void {
    if (this.attached) {
      // Idempotent — double-attach is a no-op rather than a throw so
      // GameMode resolution during hot-reload is safe.
      return;
    }
    this.pawn = pawn;
    this.input = input;
    input.activate(this.world);
    pawn.possess();
    this.attached = true;
  }

  tick(_dt: number): void {
    // Intentionally empty. InteractionRouter ticks itself via its
    // `System.update()` hook registered at world-build time; adding
    // another tick here would double-route clicks.
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
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

  /**
   * Diagnostic helper — returns the bound InteractionRouter (or null if
   * this world doesn't have one, e.g. server-side). Not part of the
   * `PlayerController` contract; used by tests and the PIE toolbar.
   */
  getInteractionRouter(): unknown | null {
    return getSystem(this.world, "interaction-router");
  }
}
