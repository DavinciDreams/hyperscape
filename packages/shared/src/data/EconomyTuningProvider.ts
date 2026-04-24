/**
 * EconomyTuningProvider
 *
 * Singleton persistence layer for the authored economy-tuning
 * manifest — currency registry (tradeable/bankStored/
 * keepOnDeath + cap), vendor buyback/sell multipliers + stock
 * restock, reusable cost-curve entries (linear over level+
 * tier with min/max clamp), auction house fees.
 *
 * Refinements: unique currency ids + unique cost-curve ids +
 * vendor.defaultCurrencyId resolves + market.currencyId
 * resolves when market.enabled + market.currencyId must be
 * tradeable when market is enabled.
 *
 * No baseline fixture — `currencies.min(1)` makes the empty
 * object schema-invalid. Safe default is unloaded.
 *
 * Runtime VendorSystem/AuctionHouseSystem not yet shipped.
 */

import {
  EconomyTuningManifestSchema,
  type EconomyTuningManifest,
} from "@hyperforge/manifest-schema";

class EconomyTuningProvider {
  private static _instance: EconomyTuningProvider | null = null;
  private _manifest: EconomyTuningManifest | null = null;

  public static getInstance(): EconomyTuningProvider {
    if (!EconomyTuningProvider._instance) {
      EconomyTuningProvider._instance = new EconomyTuningProvider();
    }
    return EconomyTuningProvider._instance;
  }

  public load(manifest: EconomyTuningManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): EconomyTuningManifest {
    const parsed = EconomyTuningManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: EconomyTuningManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): EconomyTuningManifest | null {
    return this._manifest;
  }
}

export { EconomyTuningProvider };
export const economyTuningProvider = EconomyTuningProvider.getInstance();
