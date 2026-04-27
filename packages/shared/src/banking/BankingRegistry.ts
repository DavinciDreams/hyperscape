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

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type BankingReloadListener = () => void;

export class BankingRegistry {
  private _manifest: BankingManifest | null = null;
  private _reloadListeners = new Set<BankingReloadListener>();

  constructor(manifest?: BankingManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: BankingManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(BankingManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: BankingReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[bankingRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
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
