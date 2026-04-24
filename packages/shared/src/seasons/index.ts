import { SeasonRegistry } from "./SeasonRegistry.js";

export {
  SeasonRegistry,
  UnknownSeasonError,
  UnknownTrackError,
  type TierProgress,
} from "./SeasonRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ seasons })` can live-dispatch
 * authored edits to a shared, id-indexed view of the season catalog.
 * Stateless wrt per-player tier progression (SeasonSystem owns that);
 * `load()` just re-indexes seasons by id.
 */
export const seasonRegistry = new SeasonRegistry();
