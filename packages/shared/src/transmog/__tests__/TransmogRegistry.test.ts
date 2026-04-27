import { TransmogManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  TransmogRegistry,
  UnknownTransmogSourceError,
} from "../TransmogRegistry.js";

function manifest() {
  return TransmogManifestSchema.parse({
    global: {
      enabled: true,
      lockedSlots: ["mainHand"],
      applyCostPerSlotCurrency: 500,
      requireSourceInInventory: false,
    },
    sources: [
      {
        id: "dragonHelmSkin",
        name: "Dragon Helm",
        slot: "helm",
        itemId: "dragonHelm",
        displayAssetId: "assetDragonHelm",
        unlockModel: "onFirstEquip",
      },
      {
        id: "shopHat",
        name: "Shop Hat",
        slot: "helm",
        displayAssetId: "assetShopHat",
        unlockModel: "vendorPurchase",
        vendorCost: 5000,
      },
      {
        id: "hordeOnlyShoulders",
        name: "Horde Shoulders",
        slot: "shoulders",
        itemId: "hordeShoulders",
        displayAssetId: "assetHordeShoulders",
        unlockModel: "onFirstAcquire",
        restriction: {
          factionAllowList: ["horde"],
        },
      },
      {
        id: "swordSkin",
        name: "Sword Skin",
        slot: "mainHand",
        itemId: "epicSword",
        displayAssetId: "assetEpicSword",
        unlockModel: "onFirstEquip",
      },
    ],
  });
}

describe("TransmogRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new TransmogRegistry(manifest());
    expect(r.size).toBe(4);
    expect(r.has("shopHat")).toBe(true);
  });

  it("throws on miss", () => {
    const r = new TransmogRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownTransmogSourceError);
  });

  it("filters by slot", () => {
    const r = new TransmogRegistry(manifest());
    expect(
      r
        .bySlot("helm")
        .map((s) => s.id)
        .sort(),
    ).toEqual(["dragonHelmSkin", "shopHat"]);
  });

  it("reverse-index by itemId", () => {
    const r = new TransmogRegistry(manifest());
    expect(r.sourcesFromItem("dragonHelm").map((s) => s.id)).toEqual([
      "dragonHelmSkin",
    ]);
  });

  it("unlocksOnAcquire finds correct sources", () => {
    const r = new TransmogRegistry(manifest());
    expect(r.unlocksOnAcquire("hordeShoulders").map((s) => s.id)).toEqual([
      "hordeOnlyShoulders",
    ]);
    expect(r.unlocksOnAcquire("dragonHelm")).toEqual([]);
  });

  it("unlocksOnEquip finds correct sources", () => {
    const r = new TransmogRegistry(manifest());
    expect(r.unlocksOnEquip("dragonHelm").map((s) => s.id)).toEqual([
      "dragonHelmSkin",
    ]);
  });
});

describe("TransmogRegistry — slot lock", () => {
  it("respects locked slots", () => {
    const r = new TransmogRegistry(manifest());
    expect(r.isSlotLocked("mainHand")).toBe(true);
    expect(r.isSlotLocked("helm")).toBe(false);
  });
});

describe("TransmogRegistry — checkApply", () => {
  const baseCtx = {
    raceId: "human",
    classId: "warrior",
    factionId: "alliance",
    unlockedSourceIds: new Set(["dragonHelmSkin", "shopHat", "swordSkin"]),
    possessedItemIds: new Set<string>(),
  };

  it("allows valid apply", () => {
    const r = new TransmogRegistry(manifest());
    const out = r.checkApply({ ...baseCtx, sourceId: "dragonHelmSkin" });
    expect(out.allowed).toBe(true);
    expect(out.cost).toBe(500);
  });

  it("rejects unknown source", () => {
    const r = new TransmogRegistry(manifest());
    const out = r.checkApply({ ...baseCtx, sourceId: "ghost" });
    expect(out.reason).toBe("unknown-source");
  });

  it("rejects locked slot", () => {
    const r = new TransmogRegistry(manifest());
    const out = r.checkApply({ ...baseCtx, sourceId: "swordSkin" });
    expect(out.reason).toBe("slot-locked");
  });

  it("rejects restricted faction", () => {
    const r = new TransmogRegistry(manifest());
    const out = r.checkApply({
      ...baseCtx,
      sourceId: "hordeOnlyShoulders",
      unlockedSourceIds: new Set(["hordeOnlyShoulders"]),
    });
    expect(out.reason).toBe("restricted");
  });

  it("rejects when not unlocked", () => {
    const r = new TransmogRegistry(manifest());
    const out = r.checkApply({
      ...baseCtx,
      sourceId: "shopHat",
      unlockedSourceIds: new Set(),
    });
    expect(out.reason).toBe("not-unlocked");
  });

  it("requires source in inventory when policy enables it", () => {
    const withPolicy = manifest();
    withPolicy.global.requireSourceInInventory = true;
    const r = new TransmogRegistry(withPolicy);
    const out = r.checkApply({ ...baseCtx, sourceId: "dragonHelmSkin" });
    expect(out.reason).toBe("source-required");
  });
});

describe("TransmogRegistry — filters", () => {
  it("sourcesByVendorCostAtMost", () => {
    const r = new TransmogRegistry(manifest());
    expect(r.sourcesByVendorCostAtMost(10_000).map((s) => s.id)).toEqual([
      "shopHat",
    ]);
    expect(r.sourcesByVendorCostAtMost(100).length).toBe(0);
  });

  it("byUnlockModel", () => {
    const r = new TransmogRegistry(manifest());
    expect(r.byUnlockModel("vendorPurchase").map((s) => s.id)).toEqual([
      "shopHat",
    ]);
  });
});

describe("TransmogRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new TransmogRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new TransmogRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new TransmogRegistry();
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
