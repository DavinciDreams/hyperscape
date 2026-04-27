import { HousingManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  HousingNotLoadedError,
  HousingRegistry,
  UnknownPlotTypeError,
} from "../HousingRegistry.js";

function manifest() {
  return HousingManifestSchema.parse({
    enabled: true,
    maxPlotsPerCharacter: 1,
    maxPlotsPerAccount: 3,
    plotTypes: [
      {
        id: "cozyApt",
        name: "Cozy Apartment",
        category: "apartment",
        widthMeters: 10,
        depthMeters: 10,
        slots: {
          interior: 50,
          exterior: 0,
        },
        visitorCap: 8,
        purchaseCost: 1000,
        purchaseCurrencyId: "gold",
        upkeepCost: 100,
        minCharacterLevel: 5,
        transferable: false,
        instanced: true,
      },
      {
        id: "grandManor",
        name: "Grand Manor",
        category: "manor",
        widthMeters: 40,
        depthMeters: 40,
        slots: {
          interior: 500,
          exterior: 100,
        },
        visitorCap: 30,
        purchaseCost: 100_000,
        upkeepCost: 5000,
        minCharacterLevel: 40,
      },
    ],
    customization: {
      allowDecoration: true,
      maxStackHeightMeters: 8,
    },
    permissions: {
      maxCoOwners: 1,
    },
    upkeep: {
      cyclePeriodDays: 7,
      gracePeriodDays: 5,
      reclaimAfterDays: 14,
      sendUpkeepWarnings: true,
      upkeepWarningDaysAhead: 2,
    },
    visitors: {
      allowGuestbook: true,
      maxGuestbookEntries: 100,
      combatPolicy: "block",
    },
  });
}

describe("HousingRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new HousingRegistry().manifest).toThrow(HousingNotLoadedError);
  });
});

describe("HousingRegistry — plot types", () => {
  it("indexes by id", () => {
    const r = new HousingRegistry(manifest());
    expect(r.has("cozyApt")).toBe(true);
    expect(r.get("grandManor").category).toBe("manor");
  });

  it("throws on unknown id", () => {
    const r = new HousingRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownPlotTypeError);
  });

  it("filters by category", () => {
    const r = new HousingRegistry(manifest());
    expect(r.byCategory("apartment").map((p) => p.id)).toEqual(["cozyApt"]);
    expect(r.byCategory("manor").map((p) => p.id)).toEqual(["grandManor"]);
  });

  it("exposes slot caps and visitor cap", () => {
    const r = new HousingRegistry(manifest());
    expect(r.slotCaps("cozyApt").interior).toBe(50);
    expect(r.visitorCap("grandManor")).toBe(30);
  });
});

describe("HousingRegistry — purchase", () => {
  const baseInput = {
    characterLevel: 10,
    charactersCurrentPlots: 0,
    accountCurrentPlots: 0,
  };

  it("allows valid purchase", () => {
    const r = new HousingRegistry(manifest());
    const out = r.checkPurchase("cozyApt", baseInput);
    expect(out.allowed).toBe(true);
    expect(out.cost).toBe(1000);
    expect(out.currencyId).toBe("gold");
  });

  it("rejects below level", () => {
    const r = new HousingRegistry(manifest());
    expect(r.checkPurchase("grandManor", baseInput).reason).toBe("below-level");
  });

  it("rejects character plot cap", () => {
    const r = new HousingRegistry(manifest());
    expect(
      r.checkPurchase("cozyApt", { ...baseInput, charactersCurrentPlots: 1 })
        .reason,
    ).toBe("char-plot-cap");
  });

  it("rejects account plot cap", () => {
    const r = new HousingRegistry(manifest());
    expect(
      r.checkPurchase("cozyApt", { ...baseInput, accountCurrentPlots: 3 })
        .reason,
    ).toBe("account-plot-cap");
  });
});

describe("HousingRegistry — upkeep phase", () => {
  it("returns paid during cycle", () => {
    const r = new HousingRegistry(manifest());
    const out = r.upkeepPhase(3);
    expect(out.phase).toBe("paid");
    expect(out.daysUntilNextPhase).toBe(4);
  });

  it("returns at-risk after cycle", () => {
    const r = new HousingRegistry(manifest());
    const out = r.upkeepPhase(10);
    expect(out.phase).toBe("at-risk");
    expect(out.daysUntilNextPhase).toBe(4);
  });

  it("returns reclaimed past threshold", () => {
    const r = new HousingRegistry(manifest());
    expect(r.upkeepPhase(20).phase).toBe("reclaimed");
  });

  it("never expires when cyclePeriod=0", () => {
    const r = new HousingRegistry();
    r.loadFromJson({
      enabled: true,
      plotTypes: [
        {
          id: "x",
          name: "X",
          category: "apartment",
          widthMeters: 1,
          depthMeters: 1,
          slots: { interior: 0, exterior: 0 },
        },
      ],
      upkeep: {
        cyclePeriodDays: 0,
        gracePeriodDays: 0,
        reclaimAfterDays: 1,
      },
    });
    const out = r.upkeepPhase(999);
    expect(out.phase).toBe("paid");
    expect(out.daysUntilNextPhase).toBe(Number.POSITIVE_INFINITY);
  });

  it("issues warnings within window", () => {
    const r = new HousingRegistry(manifest());
    expect(r.shouldSendUpkeepWarning(1)).toBe(true);
    expect(r.shouldSendUpkeepWarning(2)).toBe(true);
    expect(r.shouldSendUpkeepWarning(3)).toBe(false);
  });
});

describe("HousingRegistry — permission tiers", () => {
  it("owner beats everything", () => {
    const r = new HousingRegistry(manifest());
    expect(r.hasTier("owner", "public")).toBe(true);
    expect(r.hasTier("owner", "friend")).toBe(true);
  });

  it("public only meets public", () => {
    const r = new HousingRegistry(manifest());
    expect(r.hasTier("public", "public")).toBe(true);
    expect(r.hasTier("public", "friend")).toBe(false);
  });

  it("blocked always denies", () => {
    const r = new HousingRegistry(manifest());
    expect(r.hasTier("blocked", "public")).toBe(false);
    expect(r.hasTier("friend", "blocked")).toBe(false);
  });
});

describe("HousingRegistry — visitors", () => {
  it("respects visitor cap", () => {
    const r = new HousingRegistry(manifest());
    expect(r.canVisit("cozyApt", 7)).toBe(true);
    expect(r.canVisit("cozyApt", 8)).toBe(false);
  });

  it("respects guestbook cap", () => {
    const r = new HousingRegistry(manifest());
    expect(r.canAddGuestbookEntry(99)).toBe(true);
    expect(r.canAddGuestbookEntry(100)).toBe(false);
  });
});

describe("HousingRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new HousingRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new HousingRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new HousingRegistry();
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
