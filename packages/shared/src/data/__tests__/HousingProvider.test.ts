/**
 * Tests for the HousingProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { housingProvider } from "../HousingProvider";

beforeEach(() => {
  housingProvider.unload();
});
afterEach(() => {
  housingProvider.unload();
});

const validPlotType = {
  id: "starterCottage",
  name: "Starter Cottage",
  category: "cottage" as const,
  widthMeters: 10,
  depthMeters: 10,
  slots: { interior: 50, exterior: 20 },
};

const validManifest = {
  enabled: true,
  plotTypes: [validPlotType],
};

describe("HousingProvider", () => {
  it("starts unloaded", () => {
    expect(housingProvider.isLoaded()).toBe(false);
    expect(housingProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts valid manifest with plotTypes", () => {
    const parsed = housingProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.plotTypes.length).toBe(1);
    expect(parsed.plotTypes[0].id).toBe("starterCottage");
    expect(parsed.customization).toBeDefined();
    expect(parsed.permissions).toBeDefined();
    expect(parsed.upkeep).toBeDefined();
    expect(parsed.visitors).toBeDefined();
    expect(housingProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob", () => {
    const parsed = housingProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.plotTypes.length).toBe(0);
    expect(housingProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no plotTypes", () => {
    expect(() => housingProvider.loadRaw({ enabled: true })).toThrow();
  });

  it("loadRaw() rejects duplicate plotType ids", () => {
    expect(() =>
      housingProvider.loadRaw({
        ...validManifest,
        plotTypes: [validPlotType, { ...validPlotType, name: "Dup" }],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects maxPlotsPerAccount < maxPlotsPerCharacter", () => {
    expect(() =>
      housingProvider.loadRaw({
        ...validManifest,
        maxPlotsPerCharacter: 5,
        maxPlotsPerAccount: 3,
      }),
    ).toThrow();
  });

  it("loadRaw() accepts maxPlotsPerAccount == maxPlotsPerCharacter", () => {
    const parsed = housingProvider.loadRaw({
      ...validManifest,
      maxPlotsPerCharacter: 3,
      maxPlotsPerAccount: 3,
    });
    expect(parsed.maxPlotsPerCharacter).toBe(3);
    expect(parsed.maxPlotsPerAccount).toBe(3);
  });

  it("loadRaw() rejects upkeep reclaim <= grace period", () => {
    expect(() =>
      housingProvider.loadRaw({
        ...validManifest,
        upkeep: {
          cyclePeriodDays: 7,
          gracePeriodDays: 5,
          reclaimAfterDays: 5,
        },
      }),
    ).toThrow();
  });

  it("loadRaw() accepts upkeep reclaim > grace period", () => {
    const parsed = housingProvider.loadRaw({
      ...validManifest,
      upkeep: {
        cyclePeriodDays: 7,
        gracePeriodDays: 5,
        reclaimAfterDays: 10,
      },
    });
    expect(parsed.upkeep.reclaimAfterDays).toBe(10);
  });

  it("loadRaw() rejects plot with widthMeters below bounds", () => {
    expect(() =>
      housingProvider.loadRaw({
        ...validManifest,
        plotTypes: [{ ...validPlotType, widthMeters: 0 }],
      }),
    ).toThrow();
  });

  it("loadRaw() accepts multiple plot categories", () => {
    const parsed = housingProvider.loadRaw({
      enabled: true,
      plotTypes: [
        validPlotType,
        {
          ...validPlotType,
          id: "grandManor",
          name: "Grand Manor",
          category: "manor" as const,
          widthMeters: 30,
          depthMeters: 30,
          slots: { interior: 200, exterior: 80 },
          purchaseCost: 1_000_000,
        },
      ],
    });
    expect(parsed.plotTypes.length).toBe(2);
    expect(parsed.plotTypes[1].category).toBe("manor");
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = housingProvider.loadRaw(validManifest);
    housingProvider.unload();
    housingProvider.load(parsed);
    expect(housingProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    housingProvider.loadRaw(validManifest);
    const parsed = housingProvider.loadRaw({ enabled: false });
    housingProvider.hotReload(parsed);
    expect(housingProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    housingProvider.loadRaw(validManifest);
    housingProvider.hotReload(null);
    expect(housingProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    housingProvider.loadRaw(validManifest);
    housingProvider.unload();
    expect(housingProvider.isLoaded()).toBe(false);
  });
});
