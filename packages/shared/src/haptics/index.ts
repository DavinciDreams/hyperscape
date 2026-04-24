import { HapticsRegistry } from "./HapticsRegistry.js";

export {
  HapticsNotLoadedError,
  HapticsRegistry,
  UnknownHapticPatternError,
} from "./HapticsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ haptics })` can live-dispatch
 * authored controller/mobile rumble pattern edits to the input
 * pipeline on the next trigger.
 */
export const hapticsRegistry = new HapticsRegistry();
