import { StatusEffectRegistry } from "./StatusEffectRegistry.js";

export {
  StatusEffectRegistry,
  UnknownStatusEffectError,
  type CleanseFilter,
  type StatusEffectInstance,
  type StatusEffectTickResult,
} from "./StatusEffectRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `worldAreasRegistry`, and `factionsRegistry` patterns so
 * `PIEEditorSession.updateManifests({ statusEffects })` can
 * live-dispatch authored edits to a shared, id-indexed view of
 * the status-effect catalog — even before the effect system reads
 * through it directly. Stateless wrt per-target effect instances
 * (those live per-entity); `load()` re-indexes effects by id +
 * rebuilds the tag reverse map for cleanse/purge lookups.
 */
export const statusEffectRegistry = new StatusEffectRegistry();
