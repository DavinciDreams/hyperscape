import { ArenaLayoutRegistry } from "./ArenaLayoutRegistry.js";

export {
  ArenaIndexOutOfRangeError,
  ArenaLayoutNotLoadedError,
  ArenaLayoutRegistry,
  type ZoneBounds,
} from "./ArenaLayoutRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ arenaLayout })` can live-
 * dispatch authored arena complex geometry (grid, lobby, hospital,
 * lobby spawn) to duel placement/zoning runtime on the next
 * authority resolve.
 */
export const arenaLayoutRegistry = new ArenaLayoutRegistry();
