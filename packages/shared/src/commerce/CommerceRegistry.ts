/**
 * Commerce registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `commerce.ts`.
 * Wraps the global commerce constants (buyback rate, sentinels,
 * interaction range, starter-store seed list) behind a typed
 * lookup surface so call sites don't re-read the raw manifest.
 */

import {
  type CommerceManifest,
  CommerceManifestSchema,
} from "@hyperforge/manifest-schema";

export class CommerceNotLoadedError extends Error {
  constructor() {
    super("CommerceRegistry used before load()");
    this.name = "CommerceNotLoadedError";
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type CommerceReloadListener = () => void;

export class CommerceRegistry {
  private _manifest: CommerceManifest | null = null;
  private _reloadListeners = new Set<CommerceReloadListener>();

  constructor(manifest?: CommerceManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: CommerceManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(CommerceManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: CommerceReloadListener): () => void {
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
          "[commerceRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): CommerceManifest {
    if (!this._manifest) throw new CommerceNotLoadedError();
    return this._manifest;
  }

  get defaultBuybackRate(): number {
    return this.manifest.defaultBuybackRate;
  }

  get bankStorageUnlimited(): number {
    return this.manifest.bankStorageUnlimited;
  }

  get storeUnlimitedStock(): number {
    return this.manifest.storeUnlimitedStock;
  }

  get interactionRange(): number {
    return this.manifest.interactionRange;
  }

  get starterStoreItemIds(): readonly string[] {
    return this.manifest.starterStoreItemIds;
  }

  /** Returns the integer refund for selling an item at `itemValue`. */
  buybackPrice(itemValue: number): number {
    if (itemValue <= 0) return 0;
    return Math.floor(itemValue * this.defaultBuybackRate);
  }

  isUnlimitedBank(capacity: number): boolean {
    return capacity === this.bankStorageUnlimited;
  }

  isUnlimitedStock(stock: number): boolean {
    return stock === this.storeUnlimitedStock;
  }

  isInInteractionRange(distance: number): boolean {
    return distance >= 0 && distance <= this.interactionRange;
  }
}
