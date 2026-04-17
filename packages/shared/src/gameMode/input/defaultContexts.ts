/**
 * Built-in InputContexts shipped with the core package.
 *
 * Contexts included:
 * - `hyperia-default` (Phase 2) — click-to-walk with optional WASD.
 * - `wasd-default` (Phase 5) — pure keyboard locomotion.
 * - `fps-default` (Phase 5) — WASD + mouse-look.
 * - `topdown-default` (Phase 5) — click-to-move with a fixed camera.
 *
 * These contexts are declarative records of which semantic actions map
 * to which physical inputs. `activate()` / `deactivate()` are no-ops
 * because Phase 5 controllers install their own DOM listeners in
 * `attach()`; the bindings here exist so the editor UI can display /
 * validate action coverage against registered controllers.
 *
 * @public
 */

import type { World } from "../../core/World";
import type { InputBinding, InputContext } from "./InputContext";

/** Read-only binding map helper — prevents mutation after construction. */
function freezeBindings(
  map: Record<string, InputBinding[]>,
): Record<string, InputBinding[]> {
  for (const key of Object.keys(map)) {
    Object.freeze(map[key]);
  }
  return Object.freeze(map);
}

export const HYPERIA_DEFAULT_CONTEXT_ID = "hyperia-default";

/**
 * Canonical Hyperia bindings. Click-to-walk + WASD-optional.
 *
 * `Move` is a *click* intent here, not a directional vector — the
 * `ClickToWalkPlayerController` consumes the mouse position raycast and
 * emits MOVE_TO intents. The optional WASD entries are retained because
 * the existing `PlayerCharacterController` accepts keyboard nudges for
 * edge cases (tutorials, locked cameras).
 */
export const HYPERIA_DEFAULT_BINDINGS: Record<string, InputBinding[]> =
  freezeBindings({
    Move: [
      { kind: "mouse", source: "left" },
      { kind: "key", source: "KeyW" },
      { kind: "key", source: "KeyA" },
      { kind: "key", source: "KeyS" },
      { kind: "key", source: "KeyD" },
    ],
    Look: [{ kind: "mouse", source: "right" }],
    Interact: [
      { kind: "mouse", source: "left" },
      { kind: "key", source: "KeyE" },
    ],
    Run: [{ kind: "key", source: "ShiftLeft" }],
    Jump: [{ kind: "key", source: "Space" }],
  });

/**
 * Factory for the Hyperia default input context. Callers receive a
 * fresh instance — the bindings table itself is frozen and shared.
 */
export function createHyperiaDefaultContext(): InputContext {
  return {
    id: HYPERIA_DEFAULT_CONTEXT_ID,
    actions: HYPERIA_DEFAULT_BINDINGS,
    // No-op: ClientInput already owns Hyperia's native bindings.
    // The context is declarative for now; Phase 5 contexts that don't
    // map onto native ClientInput behavior will install real bindings.
    activate: (_world: World) => {
      /* no-op for default context — bindings are already native */
    },
    deactivate: (_world: World) => {
      /* no-op */
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 5 — alternate contexts paired with the new controllers.
// ---------------------------------------------------------------------------

export const WASD_DEFAULT_CONTEXT_ID = "wasd-default";

/**
 * Pure keyboard locomotion with Shift-to-run and Space-to-jump. No
 * mouse bindings — pair with an orbit / fixed-angle camera.
 */
export const WASD_DEFAULT_BINDINGS: Record<string, InputBinding[]> =
  freezeBindings({
    Move: [
      { kind: "key", source: "KeyW" },
      { kind: "key", source: "KeyA" },
      { kind: "key", source: "KeyS" },
      { kind: "key", source: "KeyD" },
    ],
    Run: [{ kind: "key", source: "ShiftLeft" }],
    Jump: [{ kind: "key", source: "Space" }],
    Interact: [{ kind: "key", source: "KeyE" }],
  });

export function createWASDDefaultContext(): InputContext {
  return {
    id: WASD_DEFAULT_CONTEXT_ID,
    actions: WASD_DEFAULT_BINDINGS,
    activate: (_world: World) => {
      /* no-op — WASDPlayerController installs its own window listeners */
    },
    deactivate: (_world: World) => {
      /* no-op */
    },
  };
}

export const FPS_DEFAULT_CONTEXT_ID = "fps-default";

/**
 * WASD movement + mouse look. Pair with a `FirstPersonCameraController`.
 */
export const FPS_DEFAULT_BINDINGS: Record<string, InputBinding[]> =
  freezeBindings({
    Move: [
      { kind: "key", source: "KeyW" },
      { kind: "key", source: "KeyA" },
      { kind: "key", source: "KeyS" },
      { kind: "key", source: "KeyD" },
    ],
    Look: [{ kind: "mouse", source: "move" }],
    Run: [{ kind: "key", source: "ShiftLeft" }],
    Jump: [{ kind: "key", source: "Space" }],
    Interact: [
      { kind: "mouse", source: "left" },
      { kind: "key", source: "KeyE" },
    ],
  });

export function createFPSDefaultContext(): InputContext {
  return {
    id: FPS_DEFAULT_CONTEXT_ID,
    actions: FPS_DEFAULT_BINDINGS,
    activate: (_world: World) => {
      /* no-op — FPS controllers install their own pointer/key listeners */
    },
    deactivate: (_world: World) => {
      /* no-op */
    },
  };
}

export const TOPDOWN_DEFAULT_CONTEXT_ID = "topdown-default";

/**
 * Click-to-move with a fixed-angle camera. Same action shape as the
 * Hyperia default but without the orbit-camera Look binding.
 */
export const TOPDOWN_DEFAULT_BINDINGS: Record<string, InputBinding[]> =
  freezeBindings({
    Move: [{ kind: "mouse", source: "left" }],
    Interact: [
      { kind: "mouse", source: "left" },
      { kind: "key", source: "KeyE" },
    ],
  });

export function createTopDownDefaultContext(): InputContext {
  return {
    id: TOPDOWN_DEFAULT_CONTEXT_ID,
    actions: TOPDOWN_DEFAULT_BINDINGS,
    activate: (_world: World) => {
      /* no-op — TopDownPlayerController installs its own viewport listener */
    },
    deactivate: (_world: World) => {
      /* no-op */
    },
  };
}
