/**
 * Server-side GameMode manifest allowlist.
 *
 * The client/PIE resolves a full `GameMode` via
 * `@hyperforge/shared/gameMode` — that registry drags in Three.js,
 * PhysX, and the whole scene layer, which has no place inside the
 * Elysia API process.
 *
 * For API validation (Phase 4 of the GameMode system) we only need two
 * things:
 *
 * 1. The canonical default manifest so new games can be seeded.
 * 2. The set of `playerController` ids the server is willing to accept
 *    on create/update. An unknown id would resolve to a broken session
 *    in the client, so reject at the edge.
 *
 * Keep the ids here in **lockstep** with whichever manifests the
 * client registers at boot. Today that is just `HyperscapeGameMode`
 * (see `packages/shared/src/gameMode/HyperscapeGameMode.ts`). Phase 5
 * will add `wasd`, `first-person`, etc. — extend the allowlists when
 * those land.
 */

export interface GameModeManifest {
  playerController: string;
  camera: string;
  inputContext: string;
  pawn: string;
}

/** Default manifest for a freshly-created game. */
export const DEFAULT_GAME_MODE_MANIFEST: GameModeManifest = {
  playerController: "click-to-walk",
  camera: "orbit",
  inputContext: "hyperscape-default",
  pawn: "humanoid-rpg",
};

/**
 * `playerController` ids the server will accept. Mirror the client's
 * registered factories exactly.
 */
export const KNOWN_PLAYER_CONTROLLER_IDS = new Set<string>([
  "click-to-walk",
  "wasd",
  "top-down",
]);

/** Camera controller ids the server accepts. */
export const KNOWN_CAMERA_IDS = new Set<string>([
  "orbit",
  "first-person",
  "fixed-angle",
]);

/** InputContext ids the server accepts. */
export const KNOWN_INPUT_CONTEXT_IDS = new Set<string>([
  "hyperscape-default",
  "wasd-default",
  "fps-default",
  "topdown-default",
]);

/** Pawn ids the server accepts. */
export const KNOWN_PAWN_IDS = new Set<string>([
  "humanoid-rpg",
  "humanoid-kinematic",
  "cursor-avatar",
]);

/** Structured validation result — `null` means the manifest is valid. */
export type ValidationError = {
  field: keyof GameModeManifest;
  value: string;
  known: string[];
};

/**
 * Validate a manifest shape against the server-side allowlists.
 * Returns `null` if every field is known, or a `ValidationError`
 * describing the first rejection.
 */
export function validateGameModeManifest(
  manifest: GameModeManifest,
): ValidationError | null {
  if (!KNOWN_PLAYER_CONTROLLER_IDS.has(manifest.playerController)) {
    return {
      field: "playerController",
      value: manifest.playerController,
      known: [...KNOWN_PLAYER_CONTROLLER_IDS],
    };
  }
  if (!KNOWN_CAMERA_IDS.has(manifest.camera)) {
    return {
      field: "camera",
      value: manifest.camera,
      known: [...KNOWN_CAMERA_IDS],
    };
  }
  if (!KNOWN_INPUT_CONTEXT_IDS.has(manifest.inputContext)) {
    return {
      field: "inputContext",
      value: manifest.inputContext,
      known: [...KNOWN_INPUT_CONTEXT_IDS],
    };
  }
  if (!KNOWN_PAWN_IDS.has(manifest.pawn)) {
    return {
      field: "pawn",
      value: manifest.pawn,
      known: [...KNOWN_PAWN_IDS],
    };
  }
  return null;
}
