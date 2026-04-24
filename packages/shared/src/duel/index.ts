import { DuelRulesRegistry } from "./DuelRulesRegistry.js";

export {
  DuelRulesNotLoadedError,
  DuelRulesRegistry,
  UnknownDuelEquipmentSlotError,
  UnknownDuelRuleError,
} from "./DuelRulesRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ duel })` can live-dispatch
 * authored duel-rule toggles + challenge timeouts + slot ordering
 * to the duel-request flow on the next authority resolve.
 */
export const duelRulesRegistry = new DuelRulesRegistry();
