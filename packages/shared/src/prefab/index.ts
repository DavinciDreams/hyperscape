import { PrefabRegistry } from "./PrefabRegistry.js";

export {
  PrefabNotLoadedError,
  PrefabRegistry,
  UnknownPrefabError,
  UnknownPrefabInstanceError,
} from "./PrefabRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ prefab })` can live-dispatch
 * authored edits to the prefab + instance graph used by downstream
 * entity-spawn systems.
 */
export const prefabRegistry = new PrefabRegistry();
