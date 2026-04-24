import { SmithingRegistry } from "./SmithingRegistry.js";

export {
  SmithingNotLoadedError,
  SmithingRegistry,
} from "./SmithingRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ smithing })` can live-dispatch
 * authored smithing tuning (smelting/smithing mechanics, hammer +
 * coal item ids, per-bar tier ladders) to the SmithingSystem on
 * the next authority resolve.
 */
export const smithingRegistry = new SmithingRegistry();
