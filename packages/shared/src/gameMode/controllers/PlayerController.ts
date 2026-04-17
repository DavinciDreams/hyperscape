/**
 * PlayerController — translates input intents into pawn commands.
 *
 * Mirrors UE5's `APlayerController`: it owns input → intent mapping
 * (e.g. "click on ground = MoveTo", "WASD = CharacterMove vector") but
 * does *not* own the body. The body is a `Pawn`, passed to `attach()`.
 *
 * Contract guarantees:
 * - `attach()` is called exactly once before the first `tick()`.
 * - `tick()` is called every frame while attached.
 * - `detach()` is called exactly once; after it returns the controller
 *   must have released all input bindings and event listeners.
 *
 * Implementations live in sibling files:
 * - `ClickToWalkPlayerController` — raycast click → MOVE_TO / INTERACT intent.
 * - `WASDPlayerController` — keyboard → CharacterMove vector.
 * - `TopDownPlayerController` — click-to-move with fixed-angle camera.
 *
 * Phase 1 scope: interface only.
 *
 * @public
 */

import type { InputContext } from "../input/InputContext";
import type { Pawn } from "../pawns/Pawn";

export interface PlayerController {
  /**
   * Unique id — matches the key this controller is registered under in
   * a `GameMode.createPlayerController` factory (e.g. `"click-to-walk"`).
   */
  readonly id: string;

  /**
   * Bind this controller to a pawn and activate its input context.
   * Called exactly once by the GameMode after construction.
   */
  attach(pawn: Pawn, input: InputContext): void;

  /**
   * Per-frame tick. `dt` is the delta-time in seconds since the last
   * tick. May issue movement intents, raycast the viewport, etc.
   */
  tick(dt: number): void;

  /**
   * Release input bindings, drop the pawn reference, and dispose any
   * engine listeners this controller registered in `attach()`.
   */
  detach(): void;
}
