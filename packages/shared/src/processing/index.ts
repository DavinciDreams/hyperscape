import { ProcessingRegistry } from "./ProcessingRegistry.js";

export {
  ProcessingNotLoadedError,
  ProcessingRegistry,
} from "./ProcessingRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ processing })` can live-
 * dispatch authored processing tuning (firemaking, cooking) to the
 * runtime ProcessingSystem on the next authority resolve.
 */
export const processingRegistry = new ProcessingRegistry();
