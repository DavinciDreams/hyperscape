/**
 * InputContext — abstract, semantic action names decoupled from physical
 * key/button bindings. Modeled on UE5's `InputMappingContext`.
 *
 * A game declares *what actions exist* (e.g. `Move`, `Look`, `Interact`)
 * and maps them to concrete input sources (keys, mouse buttons, gamepad
 * axes). A `PlayerController` consumes actions by name, so re-mapping
 * a key is a configuration change, not a code change.
 *
 * Phase 1 scope: interface + binding shape. Concrete contexts
 * (`hyperscape-default`, `wasd-default`, `fps-default`) land in Phase 2.
 *
 * @public
 */

import type { World } from "../../core/World";

/**
 * Canonical action names understood by the GameMode contract. Games are
 * free to register additional action names, but these five are the
 * lingua franca every controller/context pair should support.
 */
export type InputActionName =
  | "Move"
  | "Look"
  | "Interact"
  | "Jump"
  | "Run"
  | (string & {}); // eslint-disable-line @typescript-eslint/ban-types

/** Source kinds an action can be bound to. */
export type InputSourceKind =
  | "key"
  | "mouse"
  | "gamepad-button"
  | "gamepad-axis";

/**
 * A single physical binding for an action. One action can have multiple
 * bindings (e.g. `Move` bound to both `WASD` and `LeftStick`).
 */
export interface InputBinding {
  kind: InputSourceKind;
  /**
   * Source identifier — interpretation depends on `kind`:
   * - `key`: KeyboardEvent.code (e.g. `"KeyW"`, `"Space"`).
   * - `mouse`: `"left" | "right" | "middle"` or `"wheel"`.
   * - `gamepad-button`: standard gamepad button index as string (e.g. `"0"`).
   * - `gamepad-axis`: gamepad axis index as string (e.g. `"0"` for left-X).
   */
  source: string;
  /**
   * Optional scalar applied to the binding's raw value. Useful for
   * inverting axes (`-1`) or scaling mouse sensitivity.
   */
  scale?: number;
}

/**
 * The full input mapping for one GameMode. Activated on the client input
 * system when its PlayerController attaches, deactivated on detach.
 */
export interface InputContext {
  /** Unique id — e.g. `"hyperscape-default"`, `"fps-default"`. */
  readonly id: string;

  /** Action name → list of physical bindings. */
  readonly actions: Record<string, InputBinding[]>;

  /**
   * Register this context with the client input system so action names
   * become queryable. Idempotent.
   */
  activate(world: World): void;

  /**
   * Unregister the context. Idempotent; safe to call without a prior
   * `activate()`.
   */
  deactivate(world: World): void;
}
