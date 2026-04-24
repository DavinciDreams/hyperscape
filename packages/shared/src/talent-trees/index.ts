import { TalentTreeRegistry } from "./TalentTreeRegistry.js";

export {
  TalentTreeRegistry,
  UnknownTalentNodeError,
  UnknownTalentTreeError,
  type Allocation,
  type SelectableReason,
  type SelectableResult,
} from "./TalentTreeRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ talentTrees })` can live-dispatch
 * authored edits to tree/node/prereq-graph consumed by TalentTreeSystem.
 */
export const talentTreeRegistry = new TalentTreeRegistry();
