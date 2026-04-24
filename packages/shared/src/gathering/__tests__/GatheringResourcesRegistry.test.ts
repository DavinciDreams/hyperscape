import {
  FishingManifestSchema,
  MiningManifestSchema,
  WoodcuttingManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  GatheringResourcesRegistry,
  UnknownResourceError,
} from "../GatheringResourcesRegistry.js";

function tree() {
  return WoodcuttingManifestSchema.parse({
    trees: [
      {
        id: "oak",
        name: "Oak Tree",
        type: "tree",
        examine: "A sturdy oak.",
        modelPath: "trees/oak.glb",
        depletedModelPath: "trees/oak_depleted.glb",
        scale: 1,
        depletedScale: 0.7,
        harvestSkill: "woodcutting",
        toolRequired: "bronze_axe",
        levelRequired: 15,
        baseCycleTicks: 5,
        depleteChance: 0.125,
        respawnTicks: 20,
        harvestYield: [
          {
            itemId: "oak_logs",
            itemName: "Oak Logs",
            quantity: 1,
            chance: 1,
            xpAmount: 37.5,
            stackable: false,
          },
        ],
      },
    ],
  });
}

function mine() {
  return MiningManifestSchema.parse({
    rocks: [
      {
        id: "copper",
        name: "Copper Rock",
        type: "ore",
        examine: "Glimmering copper.",
        modelPath: "rocks/copper.glb",
        depletedModelPath: "rocks/depleted.glb",
        scale: 1,
        depletedScale: 1,
        harvestSkill: "mining",
        toolRequired: "bronze_pickaxe",
        levelRequired: 1,
        baseCycleTicks: 3,
        depleteChance: 0.2,
        respawnTicks: 8,
        harvestYield: [
          {
            itemId: "copper_ore",
            itemName: "Copper Ore",
            quantity: 1,
            chance: 1,
            xpAmount: 17.5,
            stackable: false,
          },
        ],
      },
    ],
  });
}

function fish() {
  return FishingManifestSchema.parse({
    spots: [
      {
        id: "lure",
        name: "Lure Fishing Spot",
        type: "fishing_spot",
        examine: "A shimmering spot.",
        modelPath: null,
        depletedModelPath: null,
        scale: 1,
        depletedScale: 1,
        harvestSkill: "fishing",
        toolRequired: "fly_fishing_rod",
        levelRequired: 20,
        baseCycleTicks: 4,
        depleteChance: 0,
        respawnTicks: 0,
        harvestYield: [
          {
            itemId: "raw_trout",
            itemName: "Raw Trout",
            quantity: 1,
            chance: 1,
            xpAmount: 50,
            stackable: false,
            levelRequired: 20,
            catchLow: 70,
            catchHigh: 100,
          },
        ],
      },
    ],
  });
}

describe("GatheringResourcesRegistry", () => {
  it("load + hasX + getX per skill", () => {
    const r = new GatheringResourcesRegistry();
    r.loadWoodcutting(tree());
    r.loadMining(mine());
    r.loadFishing(fish());
    expect(r.hasTree("oak")).toBe(true);
    expect(r.hasRock("copper")).toBe(true);
    expect(r.hasFishingSpot("lure")).toBe(true);
    expect(r.tree("oak").levelRequired).toBe(15);
    expect(r.rock("copper").baseCycleTicks).toBe(3);
    expect(r.fishingSpot("lure").harvestYield[0].catchHigh).toBe(100);
  });

  it("per-skill error on unknown id", () => {
    const r = new GatheringResourcesRegistry();
    r.loadWoodcutting(tree());
    r.loadMining(mine());
    r.loadFishing(fish());
    expect(() => r.tree("ghost")).toThrow(UnknownResourceError);
    expect(() => r.rock("ghost")).toThrow(UnknownResourceError);
    expect(() => r.fishingSpot("ghost")).toThrow(UnknownResourceError);
  });

  it("requiringTool walks all three indexes", () => {
    const r = new GatheringResourcesRegistry();
    r.loadWoodcutting(tree());
    r.loadMining(mine());
    r.loadFishing(fish());
    expect(r.requiringTool("bronze_axe").map((x) => x.id)).toEqual(["oak"]);
    expect(r.requiringTool("bronze_pickaxe").map((x) => x.id)).toEqual([
      "copper",
    ]);
    expect(r.requiringTool("fly_fishing_rod").map((x) => x.id)).toEqual([
      "lure",
    ]);
    expect(r.requiringTool("none")).toEqual([]);
  });

  it("list accessors return loaded resources", () => {
    const r = new GatheringResourcesRegistry();
    r.loadWoodcutting(tree());
    expect(r.trees.map((t) => t.id)).toEqual(["oak"]);
    expect(r.rocks).toEqual([]);
    expect(r.fishingSpots).toEqual([]);
  });

  it("findResource walks all three indexes and returns null on miss", () => {
    const r = new GatheringResourcesRegistry();
    r.loadWoodcutting(tree());
    r.loadMining(mine());
    r.loadFishing(fish());
    expect(r.findResource("oak")?.id).toBe("oak");
    expect(r.findResource("copper")?.id).toBe("copper");
    expect(r.findResource("lure")?.id).toBe("lure");
    expect(r.findResource("ghost")).toBeNull();
  });
});
