import { PetRegistry } from "./PetRegistry.js";

export {
  PetRegistry,
  UnknownPetError,
  type CanSummonPetReason,
  type CanSummonPetResult,
  type EffectivePetStats,
  type OwnerScalingInput,
  type PetSummonContext,
} from "./PetRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `worldAreasRegistry`, and `factionsRegistry` patterns so
 * `PIEEditorSession.updateManifests({ petCompanion })` can
 * live-dispatch authored edits to a shared, id-indexed view of
 * the pet catalog — even before the pet system reads through it
 * directly. Stateless wrt per-summon state (summon contexts
 * live per-character); `load()` just re-indexes pets by id.
 */
export const petRegistry = new PetRegistry();
