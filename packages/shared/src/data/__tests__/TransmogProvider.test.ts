/**
 * Tests for the TransmogProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { transmogProvider } from "../TransmogProvider";

beforeEach(() => {
  transmogProvider.unload();
});
afterEach(() => {
  transmogProvider.unload();
});

const validSource = {
  id: "ironHelmSkin",
  name: "Iron Helm Appearance",
  slot: "helm" as const,
  displayAssetId: "ironHelmMesh",
  itemId: "ironHelm",
  unlockModel: "onFirstAcquire" as const,
};

describe("TransmogProvider", () => {
  it("starts unloaded", () => {
    expect(transmogProvider.isLoaded()).toBe(false);
    expect(transmogProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty blob and fills defaults", () => {
    const parsed = transmogProvider.loadRaw({});
    expect(parsed.sources).toEqual([]);
    expect(parsed.global).toBeDefined();
    expect(parsed.global.enabled).toBe(true);
    expect(parsed.outfits).toBeDefined();
    expect(transmogProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts valid source list", () => {
    const parsed = transmogProvider.loadRaw({
      sources: [validSource],
    });
    expect(parsed.sources.length).toBe(1);
    expect(parsed.sources[0].id).toBe("ironHelmSkin");
  });

  it("loadRaw() rejects duplicate source ids", () => {
    expect(() =>
      transmogProvider.loadRaw({
        sources: [validSource, { ...validSource, name: "Dup" }],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects vendorPurchase with vendorCost=0", () => {
    expect(() =>
      transmogProvider.loadRaw({
        sources: [
          {
            ...validSource,
            unlockModel: "vendorPurchase" as const,
            vendorCost: 0,
          },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() accepts vendorPurchase with vendorCost>0", () => {
    const parsed = transmogProvider.loadRaw({
      sources: [
        {
          ...validSource,
          unlockModel: "vendorPurchase" as const,
          vendorCost: 1000,
        },
      ],
    });
    expect(parsed.sources[0].vendorCost).toBe(1000);
  });

  it("loadRaw() rejects onFirstEquip without itemId", () => {
    expect(() =>
      transmogProvider.loadRaw({
        sources: [
          {
            ...validSource,
            unlockModel: "onFirstEquip" as const,
            itemId: "",
          },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects onFirstAcquire without itemId", () => {
    expect(() =>
      transmogProvider.loadRaw({
        sources: [
          {
            ...validSource,
            unlockModel: "onFirstAcquire" as const,
            itemId: "",
          },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() accepts manual/questReward/collectionEvent without itemId", () => {
    const parsed = transmogProvider.loadRaw({
      sources: [
        {
          ...validSource,
          id: "questDrop",
          unlockModel: "questReward" as const,
          itemId: "",
        },
      ],
    });
    expect(parsed.sources[0].unlockModel).toBe("questReward");
  });

  it("loadRaw() rejects outfits.enabled=true with maxOutfitsPerCharacter=0", () => {
    expect(() =>
      transmogProvider.loadRaw({
        outfits: { enabled: true, maxOutfitsPerCharacter: 0 },
      }),
    ).toThrow();
  });

  it("loadRaw() accepts outfits.enabled=false with maxOutfitsPerCharacter=0", () => {
    const parsed = transmogProvider.loadRaw({
      outfits: { enabled: false, maxOutfitsPerCharacter: 0 },
    });
    expect(parsed.outfits.enabled).toBe(false);
  });

  it("loadRaw() rejects empty raceAllowList", () => {
    expect(() =>
      transmogProvider.loadRaw({
        sources: [
          {
            ...validSource,
            restriction: { raceAllowList: [] },
          },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() accepts 'all' restriction wildcards", () => {
    const parsed = transmogProvider.loadRaw({
      sources: [
        {
          ...validSource,
          restriction: {
            raceAllowList: "all",
            classAllowList: "all",
            factionAllowList: "all",
          },
        },
      ],
    });
    expect(parsed.sources[0].restriction.raceAllowList).toBe("all");
  });

  it("loadRaw() rejects invalid color string", () => {
    expect(() =>
      transmogProvider.loadRaw({
        sources: [{ ...validSource, color: "notAColor" }],
      }),
    ).toThrow();
  });

  it("loadRaw() accepts global.lockedSlots", () => {
    const parsed = transmogProvider.loadRaw({
      global: { lockedSlots: ["mainHand", "offHand"] },
    });
    expect(parsed.global.lockedSlots).toEqual(["mainHand", "offHand"]);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = transmogProvider.loadRaw({});
    transmogProvider.unload();
    transmogProvider.load(parsed);
    expect(transmogProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    transmogProvider.loadRaw({ sources: [validSource] });
    const parsed = transmogProvider.loadRaw({});
    transmogProvider.hotReload(parsed);
    expect(transmogProvider.getManifest()?.sources).toEqual([]);
  });

  it("hotReload(null) clears the manifest", () => {
    transmogProvider.loadRaw({});
    transmogProvider.hotReload(null);
    expect(transmogProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    transmogProvider.loadRaw({});
    transmogProvider.unload();
    expect(transmogProvider.isLoaded()).toBe(false);
  });
});
