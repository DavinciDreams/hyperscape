/**
 * Banking registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `banking.ts`.
 * Wraps bank size/UI/transaction-limit constants and user-facing
 * message strings behind typed accessors.
 */

import {
  type BankingErrors,
  type BankingManifest,
  BankingManifestSchema,
  type BankingMessages,
} from "@hyperforge/manifest-schema";

export class BankingNotLoadedError extends Error {
  constructor() {
    super("BankingRegistry used before load()");
    this.name = "BankingNotLoadedError";
  }
}

export class BankingRegistry {
  private _manifest: BankingManifest | null = null;

  constructor(manifest?: BankingManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: BankingManifest): void {
    this._manifest = manifest;
  }

  loadFromJson(raw: unknown): void {
    this.load(BankingManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): BankingManifest {
    if (!this._manifest) throw new BankingNotLoadedError();
    return this._manifest;
  }

  get sizes(): BankingManifest["sizes"] {
    return this.manifest.sizes;
  }

  get ui(): BankingManifest["ui"] {
    return this.manifest.ui;
  }

  get transactionLimits(): BankingManifest["transactionLimits"] {
    return this.manifest.transactionLimits;
  }

  get errors(): BankingErrors {
    return this.manifest.errors;
  }

  get messages(): BankingMessages {
    return this.manifest.messages;
  }

  /** Total slots available given the current tab count (capped at maxBankSlots). */
  totalSlotsForTabs(tabs: number): number {
    const s = this.manifest.sizes;
    const t = Math.max(1, Math.min(tabs, s.maxTabs));
    return Math.min(t * s.slotsPerTab, s.maxBankSlots);
  }

  isStackAmountValid(amount: number): boolean {
    const t = this.manifest.transactionLimits;
    return amount >= t.minItemQuantity && amount <= t.maxItemStack;
  }
}
