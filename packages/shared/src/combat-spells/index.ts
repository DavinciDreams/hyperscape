import { CombatSpellsRegistry } from "./CombatSpellsRegistry.js";

export {
  type CombatSpellTier,
  CombatSpellsNotLoadedError,
  CombatSpellsRegistry,
  UnknownCombatSpellError,
} from "./CombatSpellsRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `worldAreasRegistry`, `runesRegistry`, `npcSizesRegistry`,
 * `npcDefinitionsRegistry` patterns so
 * `PIEEditorSession.updateManifests({ spells })` can live-dispatch
 * authored Strike/Bolt-tier spell edits to a shared, id-indexed
 * view of the spell catalog. SpellService reads through this
 * instance via the registry-prefer-fallback wiring.
 */
export const combatSpellsRegistry = new CombatSpellsRegistry();
