import { TreeCatalogRegistry } from "./TreeCatalogRegistry.js";

export {
  TreeCatalogRegistry,
  TreesNotLoadedError,
  UnknownTreeError,
} from "./TreeCatalogRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ trees })` can live-dispatch
 * authored tree catalogs (woodcutting levels + logs + XP + respawn)
 * to gathering systems on the next authority resolve.
 */
export const treeCatalogRegistry = new TreeCatalogRegistry();
