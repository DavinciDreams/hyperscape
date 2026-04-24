import { ProfilerOverlayRegistry } from "./ProfilerOverlayRegistry.js";

export {
  type ProfilerBand,
  ProfilerOverlayNotLoadedError,
  ProfilerOverlayRegistry,
  UnknownProfilerMetricError,
} from "./ProfilerOverlayRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ profilerOverlay })` can live-
 * dispatch authored on-screen metric + threshold-band edits to the
 * profiler HUD on the next render tick.
 */
export const profilerOverlayRegistry = new ProfilerOverlayRegistry();
