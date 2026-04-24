import { ScreenshotRegistry } from "./ScreenshotRegistry.js";

export {
  ScreenshotNotLoadedError,
  ScreenshotRegistry,
  UnknownShareTargetError,
} from "./ScreenshotRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ screenshot })` can live-dispatch
 * authored photo-mode capture policy + share-target catalog + watermark
 * rules consumed by the Screenshot/PhotoMode system on the next capture.
 */
export const screenshotRegistry = new ScreenshotRegistry();
