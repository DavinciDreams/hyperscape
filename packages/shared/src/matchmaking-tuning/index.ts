import { MatchmakingRegistry } from "./MatchmakingRegistry.js";

export {
  MatchmakingNotLoadedError,
  MatchmakingRegistry,
  UnknownQueueError,
  type EffectiveWindow,
  type PartyCheckInput,
  type PartyCheckReason,
  type PartyCheckResult,
} from "./MatchmakingRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ matchmakingTuning })` can live-
 * dispatch authored queue / skill-model / widening-schedule /
 * party-constraint edits to the matchmaker on the next eligibility
 * check.
 */
export const matchmakingRegistry = new MatchmakingRegistry();
