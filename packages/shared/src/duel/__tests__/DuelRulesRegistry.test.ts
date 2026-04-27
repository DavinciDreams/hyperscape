import { DuelManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  DuelRulesNotLoadedError,
  DuelRulesRegistry,
  UnknownDuelEquipmentSlotError,
  UnknownDuelRuleError,
} from "../DuelRulesRegistry.js";

function manifest() {
  return DuelManifestSchema.parse({
    $schema: "hyperforge.duel.v1",
    challengeTimeoutMs: 30_000,
    rules: {
      noMagic: {
        label: "No Magic",
        description: "Magic forbidden.",
        incompatibleWith: ["magicOnly"],
      },
      magicOnly: {
        label: "Magic Only",
        description: "Only magic.",
        incompatibleWith: ["noMagic", "noMelee"],
      },
      noMelee: {
        label: "No Melee",
        description: "Melee forbidden.",
        incompatibleWith: [],
      },
      noFood: {
        label: "No Food",
        description: "No food.",
        incompatibleWith: [],
      },
    },
    equipmentSlots: {
      head: { label: "Head", order: 0 },
      cape: { label: "Cape", order: 1 },
      weapon: { label: "Weapon", order: 3 },
      body: { label: "Body", order: 2 },
    },
    duelSlotToEquipmentSlot: {
      head: "head",
      weapon: "main_hand",
    },
  });
}

describe("DuelRulesRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new DuelRulesRegistry().manifest).toThrow(
      DuelRulesNotLoadedError,
    );
  });

  it("rule / slot lookup + unknown errors", () => {
    const r = new DuelRulesRegistry(manifest());
    expect(r.rule("noMagic").label).toBe("No Magic");
    expect(r.equipmentSlot("weapon").order).toBe(3);
    expect(() => r.rule("ghost")).toThrow(UnknownDuelRuleError);
    expect(() => r.equipmentSlot("ghost")).toThrow(
      UnknownDuelEquipmentSlotError,
    );
  });

  it("incompatibleWith walks both directions", () => {
    const r = new DuelRulesRegistry(manifest());
    // Selecting noMagic blocks magicOnly directly
    expect(r.incompatibleWith(["noMagic"]).sort()).toEqual(["magicOnly"]);
    // Selecting noMelee blocks magicOnly via reverse edge
    expect(r.incompatibleWith(["noMelee"]).sort()).toEqual(["magicOnly"]);
  });

  it("orderedSlotKeys respects `order` field", () => {
    const r = new DuelRulesRegistry(manifest());
    expect(r.orderedSlotKeys()).toEqual(["head", "cape", "body", "weapon"]);
  });

  it("ecsSlotFor maps duel slot names to ECS slot names", () => {
    const r = new DuelRulesRegistry(manifest());
    expect(r.ecsSlotFor("weapon")).toBe("main_hand");
    expect(r.ecsSlotFor("head")).toBe("head");
    expect(r.ecsSlotFor("unknown")).toBeUndefined();
  });
});

describe("DuelRulesRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new DuelRulesRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new DuelRulesRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new DuelRulesRegistry();
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
