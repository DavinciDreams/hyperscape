import { DamageTypeRegistry } from "./DamageTypeRegistry.js";

export {
  DamageTypeRegistry,
  UnknownDamageTypeError,
} from "./DamageTypeRegistry.js";

/**
 * Module-level singleton. Mirrors the `gatheringResources` and
 * `worldAreasRegistry` patterns so `PIEEditorSession.updateManifests({
 * damageTypes })` can live-dispatch authored edits to a shared,
 * id-indexed view of the damage-type catalog — even before combat
 * systems consume it directly. When `CombatSystem` lands a read
 * through this registry, it imports `damageTypeRegistry` and resolves
 * typed multipliers through the same instance that the editor is
 * writing to.
 */
export const damageTypeRegistry = new DamageTypeRegistry();
