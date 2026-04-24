import { EnchantmentRegistry } from "./EnchantmentRegistry.js";

export {
  EnchantmentRegistry,
  UnknownEnchantmentError,
  type ApplyCheckReason,
  type ApplyCheckResult,
  type StatDelta,
} from "./EnchantmentRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `worldAreasRegistry`, and `factionsRegistry` patterns so
 * `PIEEditorSession.updateManifests({ enchantments })` can
 * live-dispatch authored edits to a shared, id-indexed view of
 * the enchantment catalog — even before the enchantment system
 * reads through it directly. Stateless wrt per-item applied
 * enchantments (those live on item instances); `load()` just
 * re-indexes enchantments by id.
 */
export const enchantmentRegistry = new EnchantmentRegistry();
