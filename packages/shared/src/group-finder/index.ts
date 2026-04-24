import { GroupFinderRegistry } from "./GroupFinderRegistry.js";

export {
  GroupFinderNotLoadedError,
  GroupFinderRegistry,
  UnknownGroupFinderContentError,
  type QueueEligibilityInput,
  type QueueEligibilityReason,
  type QueueEligibilityResult,
} from "./GroupFinderRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ groupFinder })` can live-
 * dispatch authored LFG/dungeon-finder edits (content list +
 * matchmaking + rewards) to the group-finder registry on the next
 * eligibility check.
 */
export const groupFinderRegistry = new GroupFinderRegistry();
