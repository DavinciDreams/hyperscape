import { FactionsRegistry } from "./FactionsRegistry.js";

export {
  FactionsNotLoadedError,
  FactionsRegistry,
  UnknownFactionError,
} from "./FactionsRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `worldAreasRegistry`, and `audioBusMixer` patterns so
 * `PIEEditorSession.updateManifests({ factions })` can
 * live-dispatch authored edits to a shared, id-indexed view of
 * the faction catalog — even before the faction/reputation
 * runtime reads through it directly. Stateless wrt runtime
 * state (standings live per-character); `load()` just re-indexes
 * factions + relationships.
 */
export const factionsRegistry = new FactionsRegistry();
