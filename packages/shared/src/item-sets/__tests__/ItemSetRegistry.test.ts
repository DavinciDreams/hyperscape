import { ItemSetsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { ItemSetRegistry, UnknownItemSetError } from "../ItemSetRegistry.js";

function manifest() {
  return ItemSetsManifestSchema.parse([
    {
      id: "dragonslayer",
      name: "Dragonslayer's Regalia",
      category: "raid",
      tier: 2,
      memberItemIds: [
        "dragonHelm",
        "dragonChest",
        "dragonLegs",
        "dragonGloves",
        "dragonBoots",
        "dragonCape",
      ],
      stages: [
        {
          requiredPieces: 2,
          label: "2pc",
          statModifiers: [{ stat: "attack", op: "add", value: 10 }],
        },
        {
          requiredPieces: 4,
          label: "4pc",
          statModifiers: [{ stat: "critChance", op: "add", value: 5 }],
          triggeredEffects: [
            {
              id: "burnProc",
              triggerEventId: "onCritHit",
              chance: 0.3,
              statusEffectId: "burn",
              damageAmount: 20,
            },
          ],
        },
        {
          requiredPieces: 6,
          label: "6pc",
          statModifiers: [{ stat: "damageDealt", op: "multiply", value: 1.1 }],
        },
      ],
    },
    {
      id: "craftedStarter",
      name: "Apprentice",
      category: "crafted",
      memberItemIds: ["appHelm", "appChest"],
      stages: [
        {
          requiredPieces: 2,
          statModifiers: [{ stat: "defense", op: "add", value: 2 }],
        },
      ],
    },
  ]);
}

describe("ItemSetRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new ItemSetRegistry(manifest());
    expect(r.size).toBe(2);
    expect(r.has("dragonslayer")).toBe(true);
  });

  it("throws on miss", () => {
    const r = new ItemSetRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownItemSetError);
  });

  it("filters by category", () => {
    const r = new ItemSetRegistry(manifest());
    expect(r.byCategory("raid").map((s) => s.id)).toEqual(["dragonslayer"]);
  });

  it("reverse-index by item id", () => {
    const r = new ItemSetRegistry(manifest());
    expect(r.setsContainingItem("dragonHelm")).toEqual(["dragonslayer"]);
    expect(r.setsContainingItem("appHelm")).toEqual(["craftedStarter"]);
    expect(r.setsContainingItem("ghost")).toEqual([]);
  });
});

describe("ItemSetRegistry — resolveBonuses", () => {
  it("aggregates bonuses for partial set", () => {
    const r = new ItemSetRegistry(manifest());
    const bonuses = r.resolveBonuses(["dragonHelm", "dragonChest"]);
    expect(bonuses.length).toBe(1);
    const b = bonuses[0];
    expect(b.equippedCount).toBe(2);
    expect(b.unlockedStages.length).toBe(1);
    expect(b.statModifiers.length).toBe(1);
    expect(b.statModifiers[0].value).toBe(10);
  });

  it("aggregates multiple stages", () => {
    const r = new ItemSetRegistry(manifest());
    const bonuses = r.resolveBonuses([
      "dragonHelm",
      "dragonChest",
      "dragonLegs",
      "dragonGloves",
    ]);
    const b = bonuses[0];
    expect(b.equippedCount).toBe(4);
    expect(b.unlockedStages.length).toBe(2);
    expect(b.statModifiers.length).toBe(2);
    expect(b.triggeredEffects.length).toBe(1);
    expect(b.triggeredEffects[0].id).toBe("burnProc");
  });

  it("skips unequipped items", () => {
    const r = new ItemSetRegistry(manifest());
    const bonuses = r.resolveBonuses(["randomThing", "otherItem"]);
    expect(bonuses).toEqual([]);
  });

  it("handles cross-set equipped pieces", () => {
    const r = new ItemSetRegistry(manifest());
    const bonuses = r.resolveBonuses([
      "dragonHelm",
      "dragonChest",
      "appHelm",
      "appChest",
    ]);
    expect(bonuses.length).toBe(2);
    expect(
      bonuses.find((b) => b.setId === "craftedStarter")?.equippedCount,
    ).toBe(2);
  });

  it("single piece unlocks no stages", () => {
    const r = new ItemSetRegistry(manifest());
    const bonuses = r.resolveBonuses(["dragonHelm"]);
    expect(bonuses[0].equippedCount).toBe(1);
    expect(bonuses[0].unlockedStages).toEqual([]);
    expect(bonuses[0].statModifiers).toEqual([]);
  });
});

describe("ItemSetRegistry — nextStage", () => {
  it("returns next stage not yet unlocked", () => {
    const r = new ItemSetRegistry(manifest());
    const s = r.nextStage("dragonslayer", 3);
    expect(s?.requiredPieces).toBe(4);
  });

  it("returns null when all stages unlocked", () => {
    const r = new ItemSetRegistry(manifest());
    expect(r.nextStage("dragonslayer", 6)).toBeNull();
  });
});
