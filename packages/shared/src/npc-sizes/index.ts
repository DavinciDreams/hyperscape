import { NPCSizesRegistry } from "./NPCSizesRegistry.js";

export {
  NPCSizesNotLoadedError,
  NPCSizesRegistry,
} from "./NPCSizesRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ npcSizes })` can live-dispatch
 * authored NPC collision footprints (tile-grid width/depth) to
 * range-calculation runtime on the next authority resolve.
 */
export const npcSizesRegistry = new NPCSizesRegistry();
