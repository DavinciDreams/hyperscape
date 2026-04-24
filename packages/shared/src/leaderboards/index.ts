import { LeaderboardEngine } from "./LeaderboardEngine.js";

export {
  LeaderboardEngine,
  UnknownLeaderboardError,
  type LeaderboardScore,
  type RankedEntry,
} from "./LeaderboardEngine.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ leaderboards })` can
 * live-dispatch authored edits to a shared, id-indexed view of the
 * leaderboard catalog. Stateless wrt submitted scores (those live on
 * the LeaderboardSystem); `load()` just re-indexes leaderboards by id.
 */
export const leaderboardEngine = new LeaderboardEngine();
