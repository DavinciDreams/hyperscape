import { ParentalControlsRegistry } from "./ParentalControlsRegistry.js";

export {
  ParentalControlsNotLoadedError,
  ParentalControlsRegistry,
  UnknownParentalProfileError,
} from "./ParentalControlsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ parentalControls })` can live-
 * dispatch authored edits to age-gated profile policy consumed by
 * ParentalControlsSystem.
 */
export const parentalControlsRegistry = new ParentalControlsRegistry();
