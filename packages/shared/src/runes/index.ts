import { RunesRegistry } from "./RunesRegistry.js";

export {
  type RuneRequirement,
  RunesNotLoadedError,
  RunesRegistry,
  UnknownRuneError,
} from "./RunesRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `worldAreasRegistry`, `npcSizesRegistry`, `storesRegistry` patterns
 * so `PIEEditorSession.updateManifests({ runes })` can live-dispatch
 * authored rune metadata + elemental-staff substitution rules to a
 * shared, id-indexed view of the rune catalog. Combat services
 * (`RuneService` and downstream) read through this instance.
 */
export const runesRegistry = new RunesRegistry();
