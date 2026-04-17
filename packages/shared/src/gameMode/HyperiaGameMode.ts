/**
 * HyperiaGameMode — the default composition for the flagship game.
 *
 * Bundles `ClickToWalkPlayerController` + `OrbitCameraController` +
 * `hyperia-default` InputContext. This is what ships today; other
 * games register their own GameMode under a different id.
 *
 * Phase 2 scope: factory + opt-in registration helper. Nothing in the
 * engine auto-registers this yet — Phase 3 wires it into
 * `createClientWorld` and `createPlayTestWorld`.
 *
 * @public
 */

import {
  CLICK_TO_WALK_CONTROLLER_ID,
  ClickToWalkPlayerController,
} from "./controllers/ClickToWalkPlayerController";
import {
  ORBIT_CAMERA_CONTROLLER_ID,
  OrbitCameraController,
} from "./cameras/OrbitCameraController";
import {
  HYPERIA_DEFAULT_CONTEXT_ID,
  createHyperiaDefaultContext,
} from "./input/defaultContexts";
import type { GameMode, GameModeContext, GameModeManifest } from "./GameMode";
import type { GameModeRegistry } from "./GameModeRegistry";

export const HYPERIA_PAWN_ID = "humanoid-rpg";

export const HYPERIA_DEFAULT_MANIFEST: GameModeManifest = Object.freeze({
  playerController: CLICK_TO_WALK_CONTROLLER_ID,
  camera: ORBIT_CAMERA_CONTROLLER_ID,
  inputContext: HYPERIA_DEFAULT_CONTEXT_ID,
  pawn: HYPERIA_PAWN_ID,
});

class HyperiaGameMode implements GameMode {
  readonly id = CLICK_TO_WALK_CONTROLLER_ID;
  readonly manifest: GameModeManifest;

  constructor(manifest: GameModeManifest) {
    this.manifest = manifest;
  }

  createPlayerController(ctx: GameModeContext): ClickToWalkPlayerController {
    return new ClickToWalkPlayerController(ctx.world);
  }

  createCameraController(ctx: GameModeContext): OrbitCameraController {
    return new OrbitCameraController(ctx.world);
  }

  createInputContext(_ctx: GameModeContext) {
    return createHyperiaDefaultContext();
  }
}

/**
 * Factory matching `GameModeFactory`. Export the factory rather than
 * the class so the class stays internal — callers only ever see the
 * `GameMode` interface.
 */
export function createHyperiaGameMode(
  manifest: GameModeManifest,
  _ctx: GameModeContext,
): GameMode {
  return new HyperiaGameMode(manifest);
}

/**
 * Opt-in registration helper. Call this from the live client and PIE
 * bootstrap (Phase 3) after the registry is created. Separate function
 * so unit tests can stand up a clean registry.
 */
export function registerHyperiaGameMode(registry: GameModeRegistry): void {
  registry.register(CLICK_TO_WALK_CONTROLLER_ID, createHyperiaGameMode);
}
