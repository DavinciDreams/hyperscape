import { StoresRegistry } from "./StoresRegistry.js";

export {
  StoresNotLoadedError,
  StoresRegistry,
  UnknownStoreError,
  UnknownStoreItemError,
} from "./StoresRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ stores })` can live-dispatch
 * authored vendor catalogs + per-store item lists to the shop/buy-
 * back runtime on the next authority resolve.
 */
export const storesRegistry = new StoresRegistry();
