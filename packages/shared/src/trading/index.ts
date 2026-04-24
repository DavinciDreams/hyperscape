import { TradingRegistry } from "./TradingRegistry.js";

export {
  TradingNotLoadedError,
  TradingRegistry,
  type AntiRmtFlag,
  type AntiRmtReport,
  type TradeEligibilityInput,
  type TradeEligibilityReason,
  type TradeEligibilityResult,
  type TradeItemInput,
  type TradeItemReason,
  type TradeItemResult,
  type TradeOfferSnapshot,
  type TradeRateLimitInput,
  type TradeRateLimitReason,
  type TradeRateLimitResult,
  type TradingRarity,
} from "./TradingRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ trading })` can live-dispatch
 * authored trade policy (session/items/currency/eligibility/rateLimit/
 * antiRmt) to the trade flow on the next authority resolve.
 */
export const tradingRegistry = new TradingRegistry();
