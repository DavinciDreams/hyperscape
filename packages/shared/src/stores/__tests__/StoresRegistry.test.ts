import { StoresManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  StoresNotLoadedError,
  StoresRegistry,
  UnknownStoreError,
  UnknownStoreItemError,
} from "../StoresRegistry.js";

function manifest() {
  return StoresManifestSchema.parse([
    {
      id: "general_store",
      name: "General Store",
      buyback: true,
      buybackRate: 0.5,
      items: [
        {
          id: "bread",
          itemId: "bread",
          name: "Bread",
          price: 10,
          stockQuantity: -1,
          restockTime: 0,
        },
        {
          id: "bronze_axe",
          itemId: "bronze_axe",
          name: "Bronze Axe",
          price: 15,
          stockQuantity: 5,
          restockTime: 60,
        },
      ],
    },
    {
      id: "magic_store",
      name: "Magic Store",
      buyback: false,
      items: [
        {
          id: "fire_rune",
          itemId: "fire_rune",
          name: "Fire Rune",
          price: 4,
          stockQuantity: 1000,
          restockTime: 30,
        },
      ],
    },
  ]);
}

describe("StoresRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new StoresRegistry().manifest).toThrow(StoresNotLoadedError);
  });

  it("indexes stores and items", () => {
    const r = new StoresRegistry(manifest());
    expect(r.get("general_store").name).toBe("General Store");
    expect(r.item("general_store", "bread").price).toBe(10);
    expect(r.items("magic_store")).toHaveLength(1);
  });

  it("throws unknown store / item", () => {
    const r = new StoresRegistry(manifest());
    expect(() => r.get("ghost_store")).toThrow(UnknownStoreError);
    expect(() => r.item("general_store", "ghost")).toThrow(
      UnknownStoreItemError,
    );
    expect(() => r.item("ghost_store", "anything")).toThrow(UnknownStoreError);
  });

  it("isUnlimitedStock detects -1 sentinel", () => {
    const r = new StoresRegistry(manifest());
    expect(r.isUnlimitedStock(r.item("general_store", "bread"))).toBe(true);
    expect(r.isUnlimitedStock(r.item("general_store", "bronze_axe"))).toBe(
      false,
    );
  });

  it("buybackPrice uses per-store rate when set", () => {
    const r = new StoresRegistry(manifest());
    expect(r.buybackPrice("general_store", 100, 0.1)).toBe(50);
  });

  it("buybackPrice falls back to default rate when store rate unset", () => {
    const r = new StoresRegistry(
      StoresManifestSchema.parse([
        {
          id: "no_rate",
          name: "No Rate",
          buyback: true,
          items: [],
        },
      ]),
    );
    expect(r.buybackPrice("no_rate", 100, 0.3)).toBe(30);
  });

  it("buybackPrice returns 0 when store disables buyback", () => {
    const r = new StoresRegistry(manifest());
    expect(r.buybackPrice("magic_store", 100, 0.5)).toBe(0);
  });
});

describe("StoresRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new StoresRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new StoresRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new StoresRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
