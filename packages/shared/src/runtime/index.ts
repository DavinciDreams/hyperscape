/**
 * World factories and runtime initialization
 */

export { createClientWorld } from "./createClientWorld";
export { createServerWorld } from "./createServerWorld";
export { createViewerWorld } from "./createViewerWorld";
export { createNodeClientWorld } from "./createNodeClientWorld";
export {
  createEditorWorld,
  initEditorWorld,
  EditorWorld,
  type EditorWorldOptions,
} from "./createEditorWorld";

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

// Re-export the runtime ScriptGraph shape so consumers (e.g. World Studio)
// can attach behavior graphs without deep-importing into the scripting subtree.
export type { RuntimeScriptGraph } from "../systems/shared/scripting/ScriptGraphInterpreter";

// Re-export GameMode surface PIE consumers need to drive the runtime /
// Simulate-vs-Play branch in usePIESession. Deeper registry manipulation
// still goes through `@hyperforge/shared/gameMode` barrel.
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
export {
  GameModeRegistry,
  gameModeRegistry,
} from "../gameMode/GameModeRegistry";
export { registerHyperiaGameMode } from "../gameMode/HyperiaGameMode";
export {
  FPS_DEFAULT_MANIFEST,
  TOP_DOWN_DEFAULT_MANIFEST,
  WASD_DEFAULT_MANIFEST,
  registerAlternateGameModes,
} from "../gameMode/AlternateGameModes";

// Re-export editor systems and types
export {
  EditorCameraSystem,
  EditorSelectionSystem,
  EditorGizmoSystem,
  type EditorCameraMode,
  type EditorCameraConfig,
  type CameraBookmark,
  type Selectable,
  type SelectionChangeEvent,
  type EditorSelectionConfig,
  type TransformMode,
  type TransformSpace,
  type TransformEvent,
  type EditorGizmoConfig,
} from "./createEditorWorld";
