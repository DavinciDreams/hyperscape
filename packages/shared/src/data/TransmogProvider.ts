/**
 * TransmogProvider
 *
 * Singleton persistence layer for the authored transmog
 * manifest — cosmetic appearance-override system. Global rules
 * (enabled + locked-slots + accountWideByDefault +
 * applyCostPerSlotCurrency + requireSourceInInventory +
 * allowHideSlot + allowDye) plus outfit-save rules
 * (enabled/maxOutfits) plus per-source appearance registry
 * (TransmogSource with 10-slot enum, 6-unlock-model +
 * perCharacter/perAccount scope, race/class/faction
 * restrictions, 6-rarity tier).
 *
 * Schema refinements (per source): vendorPurchase requires
 * cost>0 + onFirstEquip|Acquire requires itemId + unique
 * lockedSlots; manifest-level: unique source ids.
 *
 * No `enabled` sentinel on the top-level blob — the
 * default-empty `sources: []` keeps the pipeline inert until
 * sources are authored. Runtime TransmogSystem not yet shipped.
 */

import {
  TransmogManifestSchema,
  type TransmogManifest,
} from "@hyperforge/manifest-schema";

class TransmogProvider {
  private static _instance: TransmogProvider | null = null;
  private _manifest: TransmogManifest | null = null;

  public static getInstance(): TransmogProvider {
    if (!TransmogProvider._instance) {
      TransmogProvider._instance = new TransmogProvider();
    }
    return TransmogProvider._instance;
  }

  public load(manifest: TransmogManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): TransmogManifest {
    const parsed = TransmogManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: TransmogManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): TransmogManifest | null {
    return this._manifest;
  }
}

export { TransmogProvider };
export const transmogProvider = TransmogProvider.getInstance();
