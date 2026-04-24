import { DuelManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
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
