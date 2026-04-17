/**
 * `@hyperforge/shared/gameMode` — public barrel for the GameMode system.
 *
 * UE5-inspired abstraction that lets each Hyperia-family game declare
 * its own player controller, camera, input context, and pawn. See
 * `packages/shared/src/gameMode/PLAN.md` for the phased migration plan.
 *
 * @public
 */

// Phase 1 — core contracts
export type {
  GameMode,
  GameModeContext,
  GameModeFactory,
  GameModeManifest,
} from "./GameMode";

export {
  GameModeRegistry,
  UnknownGameModeError,
  gameModeRegistry,
} from "./GameModeRegistry";

export type { PlayerController } from "./controllers/PlayerController";
export type { CameraController } from "./cameras/CameraController";
export type {
  InputActionName,
  InputBinding,
  InputContext,
  InputSourceKind,
} from "./input/InputContext";
export type { Pawn } from "./pawns/Pawn";

// Phase 2 — Hyperia default composition
export {
  CLICK_TO_WALK_CONTROLLER_ID,
  ClickToWalkPlayerController,
} from "./controllers/ClickToWalkPlayerController";
export {
  ORBIT_CAMERA_CONTROLLER_ID,
  OrbitCameraController,
} from "./cameras/OrbitCameraController";
export {
  HYPERIA_DEFAULT_BINDINGS,
  HYPERIA_DEFAULT_CONTEXT_ID,
  createHyperiaDefaultContext,
} from "./input/defaultContexts";
export {
  HYPERIA_DEFAULT_MANIFEST,
  HYPERIA_PAWN_ID,
  createHyperiaGameMode,
  registerHyperiaGameMode,
} from "./HyperiaGameMode";

// Phase 5 — alternate controllers, cameras, and manifests
export {
  WASD_CONTROLLER_ID,
  WASDPlayerController,
} from "./controllers/WASDPlayerController";
export {
  TOP_DOWN_CONTROLLER_ID,
  TopDownPlayerController,
} from "./controllers/TopDownPlayerController";
export {
  FIRST_PERSON_CAMERA_CONTROLLER_ID,
  FirstPersonCameraController,
} from "./cameras/FirstPersonCameraController";
export {
  FIXED_ANGLE_CAMERA_CONTROLLER_ID,
  FixedAngleCameraController,
} from "./cameras/FixedAngleCameraController";
export {
  FPS_DEFAULT_BINDINGS,
  FPS_DEFAULT_CONTEXT_ID,
  TOPDOWN_DEFAULT_BINDINGS,
  TOPDOWN_DEFAULT_CONTEXT_ID,
  WASD_DEFAULT_BINDINGS,
  WASD_DEFAULT_CONTEXT_ID,
  createFPSDefaultContext,
  createTopDownDefaultContext,
  createWASDDefaultContext,
} from "./input/defaultContexts";
export {
  FIXED_ANGLE_PAWN_ID,
  FPS_DEFAULT_MANIFEST,
  TOP_DOWN_DEFAULT_MANIFEST,
  WASD_DEFAULT_MANIFEST,
  WASD_PAWN_ID,
  createTopDownGameMode,
  createWASDGameMode,
  registerAlternateGameModes,
} from "./AlternateGameModes";
