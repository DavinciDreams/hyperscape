/**
 * BankingProvider
 *
 * Singleton persistence layer for the authored banking manifest —
 * bank capacity + UI + transaction limits + error/message catalogs
 * consumed by the banking system runtime.
 *
 * No baseline fixture — `$schema` + sizes/ui/transactionLimits/errors/
 * messages are all required without defaults.
 *
 * Runtime BankingSystem migration off legacy loader pending.
 */

import {
  BankingManifestSchema,
  type BankingManifest,
} from "@hyperforge/manifest-schema";

class BankingProvider {
  private static _instance: BankingProvider | null = null;
  private _manifest: BankingManifest | null = null;

  public static getInstance(): BankingProvider {
    if (!BankingProvider._instance) {
      BankingProvider._instance = new BankingProvider();
    }
    return BankingProvider._instance;
  }

  public load(manifest: BankingManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): BankingManifest {
    const parsed = BankingManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: BankingManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): BankingManifest | null {
    return this._manifest;
  }
}

export { BankingProvider };
export const bankingProvider = BankingProvider.getInstance();
