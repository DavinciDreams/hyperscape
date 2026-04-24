/**
 * TradingProvider
 *
 * Singleton persistence layer for the authored P2P trade
 * manifest — single policy blob with 6 rule groups: session
 * (confirmMode bothConfirm|singleConfirm|none + countdown +
 * timeout + distance), items (soulbound/BoA/quest blocks +
 * gearScore/rarity gates + blocklist), currency (commission
 * 0..1 + per-side cap + premium block), eligibility (cross-
 * faction/friendship/account-age/level gap + ignore block),
 * rateLimit (day≥hour superset refinement), antiRmt (heuristic
 * flagging with auto-suspend threshold).
 *
 * Refinement rejects confirmMode='none' +
 * sessionTimeoutSec=0 (unsafe freeze vector).
 *
 * Runtime TradeSystem not yet shipped.
 */

import {
  TradingManifestSchema,
  type TradingManifest,
} from "@hyperforge/manifest-schema";

class TradingProvider {
  private static _instance: TradingProvider | null = null;
  private _manifest: TradingManifest | null = null;

  public static getInstance(): TradingProvider {
    if (!TradingProvider._instance) {
      TradingProvider._instance = new TradingProvider();
    }
    return TradingProvider._instance;
  }

  public load(manifest: TradingManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): TradingManifest {
    const parsed = TradingManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: TradingManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): TradingManifest | null {
    return this._manifest;
  }
}

export { TradingProvider };
export const tradingProvider = TradingProvider.getInstance();
