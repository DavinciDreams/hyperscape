import { AuctionHouseRegistry } from "./AuctionHouseRegistry.js";

export {
  AuctionHouseNotLoadedError,
  AuctionHouseRegistry,
  type BidInput,
  type BidReason,
  type BidResult,
  type CancelReason,
  type CancelResult,
  type ListQuote,
  type ListQuoteInput,
  type ListQuoteReason,
} from "./AuctionHouseRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ auctionHouse })` can live-dispatch
 * authored edits to listing/bidding/fee/anti-manipulation policy
 * consumed by AuctionHouseSystem.
 */
export const auctionHouseRegistry = new AuctionHouseRegistry();
