/**
 * PIE (Play-In-Editor) entry point.
 *
 * This file exists as a *narrow* public surface for the editor — it only
 * exports the PlayTestWorld + PIEScriptRunner pair and their associated types.
 * That keeps the asset-forge TypeScript program from transitively pulling in
 * the entire shared/runtime graph (createClientWorld, createServerWorld, …)
 * which would blow past asset-forge's `rootDir`.
 *
 * If you find yourself adding a non-PIE export here, add it to
 * `runtime/index.ts` instead and re-export it through the `.` entry.
 */

export {
  createPlayTestWorld,
  PlayTestWorld,
  type PlayTestWorldOptions,
  type PIEEntity,
  type PIEDebugEntry,
  type PIEDebugSink,
} from "./createPlayTestWorld";

export {
  PIEScriptRunner,
  type PIEDebugLevel,
  type PIEScriptRunnerOptions,
  type PIEEntityLookup,
} from "./PIEScriptRunner";

export type { RuntimeScriptGraph } from "../systems/shared/scripting/ScriptGraphInterpreter";

// GameMode surface exposed to PIE consumers. usePIESession reads
// `HYPERIA_DEFAULT_MANIFEST` and branches on `CLICK_TO_WALK_CONTROLLER_ID`.
// Deeper registry manipulation still lives behind `@hyperforge/shared/gameMode`.
export type {
  GameMode,
  GameModeManifest,
  GameModeContext,
} from "../gameMode/GameMode";
export {
  HYPERIA_DEFAULT_MANIFEST,
  HYPERIA_PAWN_ID,
} from "../gameMode/HyperiaGameMode";
export { CLICK_TO_WALK_CONTROLLER_ID } from "../gameMode/controllers/ClickToWalkPlayerController";
export { ORBIT_CAMERA_CONTROLLER_ID } from "../gameMode/cameras/OrbitCameraController";
