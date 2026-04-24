import { TitleRegistry } from "./TitleRegistry.js";

export {
  TitleRegistry,
  UnknownTitleError,
  formatByMode,
  type TitlePlayerState,
  type TitleUnlockEvaluation,
} from "./TitleRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `factionsRegistry`, and `enchantmentRegistry` patterns so
 * `PIEEditorSession.updateManifests({ titles })` can live-dispatch
 * authored edits to a shared, id-indexed view of the title catalog.
 * Stateless wrt per-player owned/active title state (caller-owned);
 * `load()` just re-indexes titles by id.
 */
export const titleRegistry = new TitleRegistry();
