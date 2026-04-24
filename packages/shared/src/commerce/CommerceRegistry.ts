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

export class CommerceRegistry {
  private _manifest: CommerceManifest | null = null;

  constructor(manifest?: CommerceManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: CommerceManifest): void {
    this._manifest = manifest;
  }

  loadFromJson(raw: unknown): void {
    this.load(CommerceManifestSchema.parse(raw));
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
