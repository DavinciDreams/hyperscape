import { WorldEventsRegistry } from "./WorldEventsRegistry.js";

export {
  UnknownPhaseError,
  UnknownWorldEventError,
  WorldEventsNotLoadedError,
  WorldEventsRegistry,
  type EligibilityInput,
  type EligibilityReason,
  type EligibilityResult,
} from "./WorldEventsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ worldEvents })` can
 * live-dispatch authored edits. Stateless wrt active event state
 * (WorldEventSystem owns participation tracking + phase progress);
 * `load()` just re-indexes events + phases by id.
 */
export const worldEventsRegistry = new WorldEventsRegistry();
