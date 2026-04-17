/**
 * GameMode — top-level abstraction that declares *how* a Hyperia-family
 * game is played.
 *
 * A `GameMode` composes a `PlayerController`, `CameraController`,
 * `InputContext`, and pawn type. Both the live client and the World Studio
 * PIE runtime resolve a `GameMode` from the game's manifest and run it —
 * the editor itself has zero knowledge of click-vs-WASD.
 *
 * Phase 1 scope: **pure types and registry contract.** Nothing in the
 * engine imports this yet. See `packages/shared/src/gameMode/PLAN.md`.
 *
 * @public
 */

import type { World } from "../core/World";
import type { CameraController } from "./cameras/CameraController";
import type { PlayerController } from "./controllers/PlayerController";
import type { InputContext } from "./input/InputContext";
import type { Pawn } from "./pawns/Pawn";

/**
 * Serializable declaration stored on the game record. Chosen by the game
 * author; resolved to concrete controllers by the `GameModeRegistry`.
 *
 * Each field is the `id` of a controller/camera/input-context/pawn
 * previously registered with the registry.
 */
export interface GameModeManifest {
  /** Registered `PlayerController.id` — e.g. `"click-to-walk"`, `"wasd"`. */
  playerController: string;
  /** Registered `CameraController.id` — e.g. `"orbit"`, `"first-person"`. */
  camera: string;
  /** Registered `InputContext.id` — e.g. `"hyperia-default"`, `"fps-default"`. */
  inputContext: string;
  /** Registered pawn type — e.g. `"humanoid-rpg"`. */
  pawn: string;
}

/**
 * Runtime handle passed to GameMode factories. Carries everything a
 * controller/camera needs to bind into the engine without hard-coding
 * world globals.
 */
export interface GameModeContext {
  /** The world the GameMode is being instantiated inside. */
  world: World;
  /**
   * `"client"` for the live client, `"pie"` for World Studio Play-In-Editor.
   * Controllers may branch on this for PIE-specific niceties (e.g. the
   * Simulate-mode overlay that bypasses pawn possession).
   */
  runtime: "client" | "pie";
  /**
   * Optional pawn override. If present, the GameMode should wire the
   * controller to this pawn instead of spawning a new one. Used by PIE
   * when the editor already instantiated a preview pawn.
   */
  pawn?: Pawn;
}

/**
 * A resolved GameMode instance. Each of the four `create*` methods returns
 * a disposable controller the caller is responsible for ticking and
 * destroying.
 */
export interface GameMode {
  /** Unique id — matches the key this GameMode was registered under. */
  readonly id: string;
  /** The manifest this instance was resolved from. */
  readonly manifest: GameModeManifest;
  createPlayerController(ctx: GameModeContext): PlayerController;
  createCameraController(ctx: GameModeContext): CameraController;
  createInputContext(ctx: GameModeContext): InputContext;
}

/** Factory signature accepted by `GameModeRegistry.register`. */
export type GameModeFactory = (
  manifest: GameModeManifest,
  ctx: GameModeContext,
) => GameMode;
