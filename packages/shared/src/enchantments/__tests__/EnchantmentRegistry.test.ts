import { EnchantmentsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  EnchantmentRegistry,
  UnknownEnchantmentError,
} from "../EnchantmentRegistry.js";

function manifest() {
  return EnchantmentsManifestSchema.parse([
    {
      id: "sharpness",
      name: "Sharpness",
      kind: "permanent",
      slots: ["weapon"],
      maxTier: 5,
      modifiers: [
        {
          stat: "attack",
          op: "add",
          tiers: [
            { tier: 1, value: 2, requiredLevel: 1 },
            { tier: 3, value: 8, requiredLevel: 20 },
            { tier: 5, value: 20, requiredLevel: 50 },
          ],
        },
      ],
      recipe: {
        reagentIds: ["magicDust", "bronzeSword"],
        stationId: "enchanterTable",
        requiredCraftingLevel: 10,
      },
    },
    {
      id: "wardRing",
      name: "Ward",
      kind: "socket-gem",
      slots: ["ring", "amulet"],
      maxTier: 3,
      modifiers: [
        {
          stat: "defense",
          op: "add",
          tiers: [
            { tier: 1, value: 5, requiredLevel: 1 },
            { tier: 3, value: 15, requiredLevel: 30 },
          ],
        },
        {
          stat: "damageTaken",
          op: "multiply",
          tiers: [{ tier: 3, value: 0.9, requiredLevel: 30 }],
        },
      ],
    },
    {
      id: "venom",
      name: "Venom",
      kind: "temporary",
      slots: ["weapon"],
      maxTier: 2,
      modifiers: [
        {
          stat: "damageDealt",
          op: "add",
          tiers: [{ tier: 1, value: 3 }],
        },
      ],
      durationHits: 100,
    },
  ]);
}

describe("EnchantmentRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new EnchantmentRegistry(manifest());
    expect(r.size).toBe(3);
  });

  it("throws on miss", () => {
    const r = new EnchantmentRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownEnchantmentError);
  });

  it("filters by kind", () => {
    const r = new EnchantmentRegistry(manifest());
    expect(r.byKind("temporary").map((e) => e.id)).toEqual(["venom"]);
  });

  it("filters by slot", () => {
    const r = new EnchantmentRegistry(manifest());
    expect(
      r
        .bySlot("weapon")
        .map((e) => e.id)
        .sort(),
    ).toEqual(["sharpness", "venom"]);
  });
});

describe("EnchantmentRegistry — canApply", () => {
  it("allows valid application", () => {
    const r = new EnchantmentRegistry(manifest());
    expect(
      r.canApply("sharpness", "weapon", { tier: 3, characterLevel: 30 })
        .allowed,
    ).toBe(true);
  });

  it("rejects wrong slot", () => {
    const r = new EnchantmentRegistry(manifest());
    const out = r.canApply("sharpness", "helmet", {
      tier: 1,
      characterLevel: 1,
    });
    expect(out.reason).toBe("slot-mismatch");
  });

  it("rejects over max tier", () => {
    const r = new EnchantmentRegistry(manifest());
    const out = r.canApply("wardRing", "ring", {
      tier: 5,
      characterLevel: 99,
    });
    expect(out.reason).toBe("tier-too-high");
  });

  it("rejects under level", () => {
    const r = new EnchantmentRegistry(manifest());
    const out = r.canApply("sharpness", "weapon", {
      tier: 5,
      characterLevel: 10,
    });
    expect(out.reason).toBe("level-too-low");
  });
});

describe("EnchantmentRegistry — deltasAtTier", () => {
  it("returns single modifier", () => {
    const r = new EnchantmentRegistry(manifest());
    const deltas = r.deltasAtTier("sharpness", 3);
    expect(deltas.length).toBe(1);
    expect(deltas[0].value).toBe(8);
  });

  it("returns multi-modifier list", () => {
    const r = new EnchantmentRegistry(manifest());
    const deltas = r.deltasAtTier("wardRing", 3);
    expect(deltas.length).toBe(2);
    expect(deltas.map((d) => d.stat).sort()).toEqual([
      "damageTaken",
      "defense",
    ]);
  });

  it("sparse ladder missing tier returns empty", () => {
    const r = new EnchantmentRegistry(manifest());
    const deltas = r.deltasAtTier("sharpness", 2);
    expect(deltas).toEqual([]);
  });
});

describe("EnchantmentRegistry — helpers", () => {
  it("tierEntry finds specific stat", () => {
    const r = new EnchantmentRegistry(manifest());
    const e = r.tierEntry("sharpness", "attack", 5);
    expect(e?.value).toBe(20);
  });

  it("tierEntry returns null for missing stat", () => {
    const r = new EnchantmentRegistry(manifest());
    expect(r.tierEntry("sharpness", "defense", 1)).toBeNull();
  });

  it("isCraftable true when recipe has reagents", () => {
    const r = new EnchantmentRegistry(manifest());
    expect(r.isCraftable("sharpness")).toBe(true);
  });

  it("isCraftable false when no reagents", () => {
    const r = new EnchantmentRegistry(manifest());
    expect(r.isCraftable("wardRing")).toBe(false);
  });
});

describe("EnchantmentRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new EnchantmentRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new EnchantmentRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new EnchantmentRegistry();
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
