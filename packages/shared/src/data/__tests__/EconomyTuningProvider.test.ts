/**
 * Tests for the EconomyTuningProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { economyTuningProvider } from "../EconomyTuningProvider";

beforeEach(() => {
  economyTuningProvider.unload();
});
afterEach(() => {
  economyTuningProvider.unload();
});

const validManifest = {
  currencies: [
    {
      id: "gold",
      name: "Gold",
      symbol: "g",
      tradeable: true,
    },
  ],
  vendor: {
    defaultCurrencyId: "gold",
  },
  market: {
    enabled: true,
    currencyId: "gold",
  },
};

describe("EconomyTuningProvider", () => {
  it("starts unloaded", () => {
    expect(economyTuningProvider.isLoaded()).toBe(false);
    expect(economyTuningProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest", () => {
    const parsed = economyTuningProvider.loadRaw(validManifest);
    expect(parsed.currencies.length).toBe(1);
    expect(economyTuningProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects empty currencies", () => {
    expect(() =>
      economyTuningProvider.loadRaw({ ...validManifest, currencies: [] }),
    ).toThrow();
  });

  it("loadRaw() rejects duplicate currency ids", () => {
    expect(() =>
      economyTuningProvider.loadRaw({
        ...validManifest,
        currencies: [
          { id: "gold", name: "A", symbol: "g" },
          { id: "gold", name: "B", symbol: "g" },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects vendor.defaultCurrencyId that doesn't resolve", () => {
    expect(() =>
      economyTuningProvider.loadRaw({
        ...validManifest,
        vendor: { defaultCurrencyId: "nonexistent" },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects non-tradeable market currency when market enabled", () => {
    expect(() =>
      economyTuningProvider.loadRaw({
        currencies: [
          { id: "gold", name: "Gold", symbol: "g", tradeable: false },
        ],
        vendor: { defaultCurrencyId: "gold" },
        market: { enabled: true, currencyId: "gold" },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects cost curve referencing unknown currency", () => {
    expect(() =>
      economyTuningProvider.loadRaw({
        ...validManifest,
        costCurves: [{ id: "repair", currencyId: "unknownCur" }],
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = economyTuningProvider.loadRaw(validManifest);
    economyTuningProvider.unload();
    economyTuningProvider.load(parsed);
    expect(economyTuningProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    economyTuningProvider.loadRaw(validManifest);
    economyTuningProvider.hotReload(null);
    expect(economyTuningProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    economyTuningProvider.loadRaw(validManifest);
    economyTuningProvider.unload();
    expect(economyTuningProvider.isLoaded()).toBe(false);
  });
});
