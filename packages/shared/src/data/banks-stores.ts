/**
 * Banks and Stores - Data-Driven Implementation
 *
 * ALL bank and store data is loaded from JSON manifests at runtime by DataManager.
 * This keeps commerce definitions data-driven and separate from code.
 *
 * Data loaded from:
 * - assets/manifests/banks.json
 * - assets/manifests/stores.json
 *
 * To modify banks or stores:
 * 1. Edit the appropriate JSON file
 * 2. Restart server to reload manifests
 *
 * DO NOT add bank/store data here - keep it in JSON!
 */

import { CommerceManifestSchema } from "@hyperforge/manifest-schema";

import commerceManifestJson from "./commerce.json" with { type: "json" };
import type { BankEntityData, StoreData } from "../types/core/core";

const commerceManifest = CommerceManifestSchema.parse(commerceManifestJson);

/**
 * Banking System - Populated from JSON manifests
 * DataManager loads from assets/manifests/banks.json
 */
export const BANKS: Record<string, BankEntityData> = {};

/**
 * General Store System - Populated from JSON manifests
 * DataManager loads from assets/manifests/stores.json
 */
export const GENERAL_STORES: Record<string, StoreData> = {};

/**
 * Helper Functions
 */
/**
 * Swap in a fresh set of stores at runtime — used by
 * `PIEEditorSession.updateManifests` for editor hot-reload.
 *
 * Clears every key in `GENERAL_STORES` in-place (preserving the
 * top-level reference so callers that imported the binding once keep
 * reading through to the new data) and re-populates it from the
 * supplied list. Shape validation is the caller's responsibility —
 * the editor's converter is the boundary for round-trip correctness.
 */
export function hotReloadStores(stores: StoreData[]): void {
  for (const key of Object.keys(GENERAL_STORES)) delete GENERAL_STORES[key];
  for (const store of stores) {
    GENERAL_STORES[store.id] = store;
  }
}

/**
 * Swap in a fresh set of banks at runtime — mirror of
 * `hotReloadStores`. Provided for symmetry even though the editor
 * doesn't currently expose bank authoring; tooling that drives banks
 * via scripting can still use it.
 */
export function hotReloadBanks(banks: BankEntityData[]): void {
  for (const key of Object.keys(BANKS)) delete BANKS[key];
  for (const bank of banks) {
    BANKS[bank.id] = bank;
  }
}

export function getBankById(bankId: string): BankEntityData | null {
  return BANKS[bankId] || null;
}

export function getBanksByZone(zoneId: string): BankEntityData[] {
  return Object.values(BANKS).filter((bank) => bank.location.zone === zoneId);
}

export function getAllBanks(): BankEntityData[] {
  return Object.values(BANKS);
}

export function getStoreById(storeId: string): StoreData | null {
  return GENERAL_STORES[storeId] || null;
}

export function getStoresByZone(zoneId: string): StoreData[] {
  return Object.values(GENERAL_STORES).filter(
    (store) => store.location?.zone === zoneId,
  );
}

export function getAllStores(): StoreData[] {
  return Object.values(GENERAL_STORES);
}

export function getStoreItemPrice(storeId: string, itemId: string): number {
  const store = getStoreById(storeId);
  if (!store) return 0;

  const item = store.items.find((item) => item.itemId === itemId);
  return item ? item.price : 0;
}

export function isItemAvailableInStore(
  storeId: string,
  itemId: string,
  quantity: number = 1,
): boolean {
  const store = getStoreById(storeId);
  if (!store) return false;

  const item = store.items.find((item) => item.itemId === itemId);
  if (!item) return false;

  // Unlimited stock
  if (item.stockQuantity === -1) return true;

  // Check if enough stock
  return item.stockQuantity >= quantity;
}

export function calculateBuybackPrice(
  itemValue: number,
  storeId: string,
): number {
  const store = getStoreById(storeId);
  if (!store || !store.buyback) return 0;

  return Math.floor(itemValue * store.buybackRate);
}

/**
 * Store and Bank Constants per GDD.
 *
 * Loaded from `commerce.json` and validated against
 * `CommerceManifestSchema` at module load.
 */
export const COMMERCE_CONSTANTS = Object.freeze({
  DEFAULT_BUYBACK_RATE: commerceManifest.defaultBuybackRate,
  BANK_STORAGE_UNLIMITED: commerceManifest.bankStorageUnlimited,
  STORE_UNLIMITED_STOCK: commerceManifest.storeUnlimitedStock,
  INTERACTION_RANGE: commerceManifest.interactionRange,
});

/**
 * Banking and Store Locations for Quick Reference
 * Computed from loaded data
 */
export function getBankLocations() {
  return Object.values(BANKS).map((bank) => ({
    id: bank.id,
    name: bank.name,
    zone: bank.location.zone,
    position: bank.location.position,
  }));
}

export function getStoreLocations() {
  return Object.values(GENERAL_STORES)
    .filter((store) => store.location) // Only include stores with location
    .map((store) => ({
      id: store.id,
      name: store.name,
      zone: store.location!.zone,
      position: store.location!.position,
    }));
}
