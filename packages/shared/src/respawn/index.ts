import { RespawnPolicyResolver } from "./RespawnPolicyResolver.js";

export {
  RespawnPolicyResolver,
  UnknownBindPointError,
  type DeathOutcome,
  type RespawnPrincipal,
  type ResurrectionOutcome,
} from "./RespawnPolicyResolver.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ respawn })` can live-dispatch
 * authored edits to bind-point registry + death-penalty + corpse-run +
 * resurrection policy consumed by CharacterService/RespawnSystem.
 */
export const respawnPolicyResolver = new RespawnPolicyResolver();
