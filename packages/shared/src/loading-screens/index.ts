import { LoadingScreensRegistry } from "./LoadingScreensRegistry.js";

export {
  LoadingScreensNotLoadedError,
  LoadingScreensRegistry,
  UnknownLoadingSlateError,
  type SlateSelectionContext,
} from "./LoadingScreensRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ loadingScreens })` can live-
 * dispatch authored slate edits to the loading-screen UI on the
 * next zone transition.
 */
export const loadingScreensRegistry = new LoadingScreensRegistry();
