import { StoreFrontRegistry } from "./StoreFrontRegistry.js";

export {
  StoreFrontNotLoadedError,
  StoreFrontRegistry,
  UnknownBundleError,
  UnknownPriceTierError,
  UnknownShelfError,
  type DiscountedPrice,
  type PurchaseCheckInput,
  type PurchaseCheckResult,
  type PurchaseReason,
  type RegionalPrice,
} from "./StoreFrontRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ storeFront })` can live-dispatch
 * authored bundle/tier/shelf/discount edits to checkout UI / catalog
 * resolvers on the next lookup.
 */
export const storeFrontRegistry = new StoreFrontRegistry();
