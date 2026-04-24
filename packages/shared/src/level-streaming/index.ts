import { LevelStreamingRegistry } from "./LevelStreamingRegistry.js";

export {
  LevelStreamingNotLoadedError,
  LevelStreamingRegistry,
  UnknownSublevelError,
} from "./LevelStreamingRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ levelStreaming })` can
 * live-dispatch authored edits to sublevel policies + trigger volumes
 * + dependency graph. Stateless wrt loaded/unloaded sublevel state
 * (runtime streamer owns that); `load()` re-indexes sublevels by id.
 */
export const levelStreamingRegistry = new LevelStreamingRegistry();
