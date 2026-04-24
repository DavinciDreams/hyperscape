/**
 * Hot-reload tests for `banks-stores`.
 *
 * Verifies that `hotReloadStores(stores)` and `hotReloadBanks(banks)`
 * swap commerce data in place while preserving the top-level
 * `GENERAL_STORES` / `BANKS` references — the invariant that lets
 * `getStoreById`, `isItemAvailableInStore`, and every other
 * commerce-system caller keep reading through the same map without
 * re-importing after a PIE hot-reload.
 */

import { describe, expect, it, afterAll } from "vitest";

import type { BankEntityData, StoreData } from "../../types/core/core.js";

import {
  BANKS,
  GENERAL_STORES,
  getStoreById,
  getBankById,
  hotReloadStores,
  hotReloadBanks,
  isItemAvailableInStore,
} from "../banks-stores.js";

// Snapshot so mutations don't leak into other tests in the run.
const INITIAL_STORES: StoreData[] = Object.values(GENERAL_STORES).map((s) => ({
  ...s,
  items: s.items.map((i) => ({ ...i })),
  location: s.location
    ? {
        ...s.location,
        position: { ...s.location.position },
      }
    : undefined,
}));
const INITIAL_BANKS: BankEntityData[] = Object.values(BANKS).map((b) => ({
  ...b,
  location: { ...b.location, position: { ...b.location.position } },
}));

afterAll(() => {
  hotReloadStores(INITIAL_STORES);
  hotReloadBanks(INITIAL_BANKS);
});

const makeStore = (overrides: Partial<StoreData> = {}): StoreData => ({
  id: "test_store",
  name: "Test Store",
  items: [
    { itemId: "bronze_sword", price: 25, stockQuantity: 10, restockRate: 60 },
  ],
  buyback: true,
  buybackRate: 0.6,
  description: "A test store",
  ...overrides,
});

describe("banks-stores hot-reload", () => {
  it("preserves the top-level GENERAL_STORES reference across reloads", () => {
    const refBefore = GENERAL_STORES;
    hotReloadStores([makeStore({ id: "custom_store" })]);
    expect(GENERAL_STORES).toBe(refBefore);
  });

  it("hot-reload replaces the prior set — ids not in the new list vanish", () => {
    hotReloadStores([
      makeStore({ id: "armor_store", name: "Armor Store" }),
      makeStore({ id: "food_store", name: "Food Store" }),
    ]);
    expect(getStoreById("armor_store")?.name).toBe("Armor Store");
    expect(getStoreById("food_store")?.name).toBe("Food Store");

    hotReloadStores([makeStore({ id: "armor_store", name: "Armor Store" })]);
    expect(getStoreById("armor_store")).not.toBeNull();
    expect(getStoreById("food_store")).toBeNull();
  });

  it("hot-reload overwrites same-id stores with new inventory", () => {
    hotReloadStores([
      makeStore({
        id: "weapon_store",
        items: [
          {
            itemId: "bronze_sword",
            price: 25,
            stockQuantity: 5,
            restockRate: 60,
          },
        ],
      }),
    ]);
    expect(isItemAvailableInStore("weapon_store", "bronze_sword", 3)).toBe(
      true,
    );

    // Second reload — stock dropped to 1, buying 3 should now fail.
    hotReloadStores([
      makeStore({
        id: "weapon_store",
        items: [
          {
            itemId: "bronze_sword",
            price: 30,
            stockQuantity: 1,
            restockRate: 60,
          },
        ],
      }),
    ]);
    expect(isItemAvailableInStore("weapon_store", "bronze_sword", 3)).toBe(
      false,
    );
    expect(isItemAvailableInStore("weapon_store", "bronze_sword", 1)).toBe(
      true,
    );
  });

  it("preserves the top-level BANKS reference and hotReloadBanks works symmetrically", () => {
    const refBefore = BANKS;
    const bank: BankEntityData = {
      id: "central_bank",
      name: "Central Bank",
      location: {
        zone: "town",
        position: { x: 0, y: 0, z: 0 },
      },
      storageCapacity: -1,
      maxSlots: 200,
      type: "general",
    };
    hotReloadBanks([bank]);
    expect(BANKS).toBe(refBefore);
    expect(getBankById("central_bank")?.name).toBe("Central Bank");

    hotReloadBanks([]);
    expect(getBankById("central_bank")).toBeNull();
  });
});
