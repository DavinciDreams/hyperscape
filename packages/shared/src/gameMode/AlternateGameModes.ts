/**
 * AlternateGameModes — Phase 5 factories that compose the alternate
 * controllers (`WASDPlayerController`, `FirstPersonCameraController`,
 * `TopDownPlayerController`, `FixedAngleCameraController`) into
 * registerable `GameMode` instances.
 *
 * Each factory is keyed off its `playerController` id, matching the
 * `GameModeRegistry.resolve()` contract. A manifest referring to any of
 * these ids produces a GameMode whose `create*` methods hand back the
 * matching alternate controllers.
 *
 * **Invariant:** when any of these modes resolve, the Hyperscape
 * `InteractionRouter` + `ClientCameraSystem` + `PlayerLocal` stack is
 * dormant. The alternate controllers are new, parallel code paths.
 *
 * @public
 */

import {
  FIRST_PERSON_CAMERA_CONTROLLER_ID,
  FirstPersonCameraController,
} from "./cameras/FirstPersonCameraController";
import {
  FIXED_ANGLE_CAMERA_CONTROLLER_ID,
  FixedAngleCameraController,
} from "./cameras/FixedAngleCameraController";
import {
  ORBIT_CAMERA_CONTROLLER_ID,
  OrbitCameraController,
} from "./cameras/OrbitCameraController";
import type { CameraController } from "./cameras/CameraController";
import {
  TOP_DOWN_CONTROLLER_ID,
  TopDownPlayerController,
} from "./controllers/TopDownPlayerController";
import {
  WASD_CONTROLLER_ID,
  WASDPlayerController,
} from "./controllers/WASDPlayerController";
import type { PlayerController } from "./controllers/PlayerController";
import type { GameMode, GameModeContext, GameModeManifest } from "./GameMode";
import type { GameModeRegistry } from "./GameModeRegistry";
import {
  FPS_DEFAULT_CONTEXT_ID,
  HYPERSCAPE_DEFAULT_CONTEXT_ID,
  TOPDOWN_DEFAULT_CONTEXT_ID,
  WASD_DEFAULT_CONTEXT_ID,
  createFPSDefaultContext,
  createHyperscapeDefaultContext,
  createTopDownDefaultContext,
  createWASDDefaultContext,
} from "./input/defaultContexts";
import type { InputContext } from "./input/InputContext";

export const WASD_PAWN_ID = "humanoid-kinematic";
export const FIXED_ANGLE_PAWN_ID = "cursor-avatar";

/** Canonical WASD + orbit manifest. */
export const WASD_DEFAULT_MANIFEST: GameModeManifest = Object.freeze({
  playerController: WASD_CONTROLLER_ID,
  camera: ORBIT_CAMERA_CONTROLLER_ID,
  inputContext: WASD_DEFAULT_CONTEXT_ID,
  pawn: WASD_PAWN_ID,
});

/** Canonical FPS manifest — WASD + first-person camera. */
export const FPS_DEFAULT_MANIFEST: GameModeManifest = Object.freeze({
  playerController: WASD_CONTROLLER_ID,
  camera: FIRST_PERSON_CAMERA_CONTROLLER_ID,
  inputContext: FPS_DEFAULT_CONTEXT_ID,
  pawn: WASD_PAWN_ID,
});

/** Canonical top-down manifest — click-to-move + fixed-angle camera. */
export const TOP_DOWN_DEFAULT_MANIFEST: GameModeManifest = Object.freeze({
  playerController: TOP_DOWN_CONTROLLER_ID,
  camera: FIXED_ANGLE_CAMERA_CONTROLLER_ID,
  inputContext: TOPDOWN_DEFAULT_CONTEXT_ID,
  pawn: FIXED_ANGLE_PAWN_ID,
});

/**
 * Pick the camera controller factory declared by the manifest. Supports
 * orbit (Hyperscape default — used when a WASD manifest chooses orbit),
 * first-person, and fixed-angle. Throws for unrecognised ids so bad
 * manifests surface at resolve time, not at first tick.
 */
function resolveCamera(
  ctx: GameModeContext,
  manifest: GameModeManifest,
): CameraController {
  switch (manifest.camera) {
    case ORBIT_CAMERA_CONTROLLER_ID:
      return new OrbitCameraController(ctx.world);
    case FIRST_PERSON_CAMERA_CONTROLLER_ID:
      return new FirstPersonCameraController(ctx.world);
    case FIXED_ANGLE_CAMERA_CONTROLLER_ID:
      return new FixedAngleCameraController(ctx.world);
    default:
      throw new Error(
        `AlternateGameModes: unknown camera id "${manifest.camera}". ` +
          `Known: orbit, first-person, fixed-angle.`,
      );
  }
}

/**
 * Pick the input context factory declared by the manifest. Matches the
 * camera resolver in error handling.
 */
function resolveInputContext(manifest: GameModeManifest): InputContext {
  switch (manifest.inputContext) {
    case HYPERSCAPE_DEFAULT_CONTEXT_ID:
      return createHyperscapeDefaultContext();
    case WASD_DEFAULT_CONTEXT_ID:
      return createWASDDefaultContext();
    case FPS_DEFAULT_CONTEXT_ID:
      return createFPSDefaultContext();
    case TOPDOWN_DEFAULT_CONTEXT_ID:
      return createTopDownDefaultContext();
    default:
      throw new Error(
        `AlternateGameModes: unknown inputContext id "${manifest.inputContext}".`,
      );
  }
}

class WASDGameMode implements GameMode {
  readonly id = WASD_CONTROLLER_ID;
  readonly manifest: GameModeManifest;

  constructor(manifest: GameModeManifest) {
    this.manifest = manifest;
  }

  createPlayerController(ctx: GameModeContext): PlayerController {
    return new WASDPlayerController(ctx.world);
  }

  createCameraController(ctx: GameModeContext): CameraController {
    return resolveCamera(ctx, this.manifest);
  }

  createInputContext(_ctx: GameModeContext): InputContext {
    return resolveInputContext(this.manifest);
  }
}

class TopDownGameMode implements GameMode {
  readonly id = TOP_DOWN_CONTROLLER_ID;
  readonly manifest: GameModeManifest;

  constructor(manifest: GameModeManifest) {
    this.manifest = manifest;
  }

  createPlayerController(ctx: GameModeContext): PlayerController {
    return new TopDownPlayerController(ctx.world);
  }

  createCameraController(ctx: GameModeContext): CameraController {
    return resolveCamera(ctx, this.manifest);
  }

  createInputContext(_ctx: GameModeContext): InputContext {
    return resolveInputContext(this.manifest);
  }
}

export function createWASDGameMode(
  manifest: GameModeManifest,
  _ctx: GameModeContext,
): GameMode {
  return new WASDGameMode(manifest);
}

export function createTopDownGameMode(
  manifest: GameModeManifest,
  _ctx: GameModeContext,
): GameMode {
  return new TopDownGameMode(manifest);
}

/**
 * Opt-in registration for the Phase 5 alternate modes. Callers mirror
 * `registerHyperscapeGameMode(registry)` — both the live client and PIE
 * call this at boot to make `wasd` and `top-down` playerController ids
 * resolvable.
 */
export function registerAlternateGameModes(registry: GameModeRegistry): void {
  registry.register(WASD_CONTROLLER_ID, createWASDGameMode);
  registry.register(TOP_DOWN_CONTROLLER_ID, createTopDownGameMode);
}
