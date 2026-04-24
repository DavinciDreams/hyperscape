import { VegetationRegistry } from "./VegetationRegistry.js";

export {
  UnknownVegetationAssetError,
  VegetationNotLoadedError,
  VegetationRegistry,
} from "./VegetationRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ vegetation })` can live-dispatch
 * authored vegetation catalogs (asset refs + density + placement)
 * to procgen/vegetation population on the next authority resolve.
 */
export const vegetationRegistry = new VegetationRegistry();
