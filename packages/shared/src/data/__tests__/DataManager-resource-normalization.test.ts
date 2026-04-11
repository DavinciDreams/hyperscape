import { describe, expect, it } from "vitest";
import type { ExternalResourceData } from "../DataManager";
import { normalizeGatheringResourceData } from "../DataManager";

function makeResource(id: string): ExternalResourceData {
  return {
    id,
    name: id,
    type: "tree",
    modelPath: null,
    depletedModelPath: "asset://models/trees/wood-tree-stump/wood-tree-stump.glb",
    modelVariants: ["asset://models/trees/example/example_01.glb"],
    scale: 1,
    depletedScale: 0.1,
    harvestSkill: "woodcutting",
    toolRequired: "bronze_hatchet",
    levelRequired: 1,
    baseCycleTicks: 4,
    depleteChance: 0.125,
    respawnTicks: 80,
    harvestYield: [
      {
        itemId: "logs",
        itemName: "Logs",
        quantity: 1,
        chance: 1,
        xpAmount: 25,
        stackable: true,
      },
    ],
  };
}

describe("normalizeGatheringResourceData", () => {
  it("rewrites staging tree resources onto packaged models", () => {
    const normalized = normalizeGatheringResourceData(makeResource("tree_general"));
    expect(normalized.modelVariants).toEqual([
      "asset://models/trees/oak_01.glb",
      "asset://models/trees/oak_02.glb",
      "asset://models/trees/oak_03.glb",
      "asset://models/trees/oak_04.glb",
      "asset://models/trees/oak_01.glb",
      "asset://models/trees/oak_02.glb",
    ]);
  });

  it("leaves unrelated resources untouched", () => {
    const resource = makeResource("tree_oak");
    expect(normalizeGatheringResourceData(resource)).toBe(resource);
  });
});
