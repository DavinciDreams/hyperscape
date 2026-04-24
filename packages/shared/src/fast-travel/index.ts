import { FastTravelGraph } from "./FastTravelGraph.js";

export {
  FastTravelGraph,
  UnknownNodeError,
  type PathResult,
  type PathStep,
  type TravelerState,
  type UsabilityOutcome,
  type UsableReason,
} from "./FastTravelGraph.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ fastTravel })` can live-
 * dispatch authored edits to the travel-node/edge graph consumed by
 * FastTravelSystem.
 */
export const fastTravelGraph = new FastTravelGraph();
