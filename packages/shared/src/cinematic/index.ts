import { CinematicRegistry } from "./CinematicRegistry.js";

export {
  CinematicNotLoadedError,
  CinematicRegistry,
  type CinematicTrackKind,
  UnknownCinematicError,
  UnknownCinematicTrackError,
} from "./CinematicRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ cinematic })` can live-dispatch
 * authored edits to cinematic tracks consumed by the sequencer.
 */
export const cinematicRegistry = new CinematicRegistry();
