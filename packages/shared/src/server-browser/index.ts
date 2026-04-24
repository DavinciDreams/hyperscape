import { ServerBrowserRegistry } from "./ServerBrowserRegistry.js";

export {
  ServerBrowserNotLoadedError,
  ServerBrowserRegistry,
  UnknownFilterFacetError,
  type PingBucket,
} from "./ServerBrowserRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ serverBrowser })` can live-dispatch
 * authored filter-facet + column + ping-bucket + list-rule edits to the
 * Server Browser UI on the next render.
 */
export const serverBrowserRegistry = new ServerBrowserRegistry();
