import { ItemSetRegistry } from "./ItemSetRegistry.js";

export {
  ItemSetRegistry,
  UnknownItemSetError,
  type ActiveSetBonuses,
} from "./ItemSetRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ itemSets })` can live-dispatch
 * authored item-set catalogs (set bonuses + tier stages + triggered
 * effects) to the equipment/combat loop on the next authority resolve.
 */
export const itemSetRegistry = new ItemSetRegistry();
