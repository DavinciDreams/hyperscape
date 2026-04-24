import { NpcDefinitionsRegistry } from "./NpcDefinitionsRegistry.js";

export {
  NpcDefinitionsNotLoadedError,
  NpcDefinitionsRegistry,
  UnknownNpcDefinitionError,
} from "./NpcDefinitionsRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `worldAreasRegistry`, `npcSizesRegistry`, `runesRegistry`,
 * `storesRegistry`, `skillIconsRegistry` patterns so
 * `PIEEditorSession.updateManifests({ npcDefinitions })` can
 * live-dispatch authored NPC catalog edits to the rich runtime
 * shape (combat stats, drops, services, dialogue, appearance).
 *
 * Used by `getNPCById(id)` in `data/npcs.ts` via the registry-
 * prefer-fallback pattern: when loaded, the registry wins; when
 * not, the legacy `ALL_NPCS` Map remains the source.
 */
export const npcDefinitionsRegistry = new NpcDefinitionsRegistry();
