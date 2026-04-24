import { NewsFeedRegistry } from "./NewsFeedRegistry.js";

export {
  NewsFeedNotLoadedError,
  NewsFeedRegistry,
  UnknownNewsCategoryError,
  UnknownNewsEntryError,
  type NewsViewerContext,
} from "./NewsFeedRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ newsFeed })` can live-dispatch
 * authored news-entry + category + feed-rule manifests to runtime
 * NewsFeedSystem on the next authority resolve.
 */
export const newsFeedRegistry = new NewsFeedRegistry();
