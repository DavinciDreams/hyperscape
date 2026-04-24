import { SpellVisualsRegistry } from "./SpellVisualsRegistry.js";

export {
  SpellVisualsNotLoadedError,
  SpellVisualsRegistry,
} from "./SpellVisualsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ spellVisuals })` can live-
 * dispatch authored edits to the spell-visual catalog consumed by
 * CombatSystem / VFX pipeline on the next `.get(spellId)` lookup.
 */
export const spellVisualsRegistry = new SpellVisualsRegistry();
