import { EconomyTuningRegistry } from "./EconomyTuningRegistry.js";

export {
  EconomyNotLoadedError,
  EconomyTuningRegistry,
  UnknownCostCurveError,
  UnknownCurrencyError,
  type CostCurveInputs,
  type MarketQuote,
  type VendorPrice,
} from "./EconomyTuningRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ economyTuning })` can live-
 * dispatch authored currency catalog + vendor markups + auction-house
 * fees + cost curves to economy systems on the next authority resolve.
 */
export const economyTuningRegistry = new EconomyTuningRegistry();
