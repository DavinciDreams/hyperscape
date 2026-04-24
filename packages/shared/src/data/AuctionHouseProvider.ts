/**
 * AuctionHouseProvider
 *
 * Singleton persistence layer for the authored auction-house
 * policy — single policy blob (not a registry) governing
 * listing model (bidOnly / buyoutOnly / bidAndBuyout), bidding
 * (minIncrement, snipe-guard anti-snipe), cancellation
 * (allow/deposit-forfeit/blocked window ≤240min), fees
 * (commissionFraction + currency + premium + daily-revenue
 * cap), search (page-size, query-length, rate-limit, anonymity,
 * public-api), and anti-manipulation heuristics
 * (flag-overpriced fraction, rapid-list/cancel, self-bidding).
 *
 * Schema refinement: listing models with bids
 * (bidOnly|bidAndBuyout) require `bidding.minIncrementFraction
 * > 0` (otherwise no bid war can progress). Sub-block
 * refinements handle anti-snipe windowSec↔extensionSec and
 * cancellation-forfeit invariants.
 *
 * A `{enabled: false}` baseline keeps the pipeline inert until
 * AH rules are authored. Runtime AuctionHouseSystem (listing
 * store, bid ledger, expire-timer + settlement, search index,
 * mail-delivered proceeds) not yet shipped.
 */

import {
  AuctionHouseManifestSchema,
  type AuctionHouseManifest,
} from "@hyperforge/manifest-schema";

class AuctionHouseProvider {
  private static _instance: AuctionHouseProvider | null = null;
  private _manifest: AuctionHouseManifest | null = null;

  public static getInstance(): AuctionHouseProvider {
    if (!AuctionHouseProvider._instance) {
      AuctionHouseProvider._instance = new AuctionHouseProvider();
    }
    return AuctionHouseProvider._instance;
  }

  public load(manifest: AuctionHouseManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): AuctionHouseManifest {
    const parsed = AuctionHouseManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: AuctionHouseManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): AuctionHouseManifest | null {
    return this._manifest;
  }
}

export { AuctionHouseProvider };
export const auctionHouseProvider = AuctionHouseProvider.getInstance();
