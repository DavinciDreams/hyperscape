import { AmmunitionRegistry } from "./AmmunitionRegistry.js";

export {
  AmmunitionNotLoadedError,
  AmmunitionRegistry,
  type ShotGateReason,
  type ShotGateResult,
  UnknownArrowError,
  UnknownBowError,
} from "./AmmunitionRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ ammunition })` can live-
 * dispatch authored bow/arrow tier + compatibility edits to the
 * ranged combat pipeline on the next shot-gate resolution.
 */
export const ammunitionRegistry = new AmmunitionRegistry();
