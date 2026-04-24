/**
 * Faithfulness test: representative entries for all three gathering
 * resource catalogs (woodcutting/mining/fishing) MUST parse cleanly against
 * their respective wrapper schemas.
 */

import { describe, expect, it } from "vitest";

import {
  WoodcuttingManifestSchema,
  MiningManifestSchema,
  FishingManifestSchema,
  type WoodcuttingManifest,
  type MiningManifest,
  type FishingManifest,
} from "./gathering-resources.js";

const woodcutting: WoodcuttingManifest = {
  $schema: "../schemas/gathering-woodcutting.schema.json",
  trees: [
    {
      id: "tree_oak",
      name: "Oak Tree",
      type: "tree",
      examine: "A sturdy oak.",
      modelPath: null,
      modelVariants: ["asset://trees/oak_a.glb", "asset://trees/oak_b.glb"],
      depletedModelPath: "asset://trees/stump.glb",
      scale: 1.2,
      depletedScale: 0.5,
      harvestSkill: "woodcutting",
      toolRequired: "hatchet",
      levelRequired: 15,
      baseCycleTicks: 3,
      depleteChance: 0.2,
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
};

const mining: MiningManifest = {
  $schema: "../schemas/gathering-mining.schema.json",
  rocks: [
    {
      id: "rock_copper",
      name: "Copper Rock",
      type: "ore",
      examine: "Rich with copper ore.",
      modelPath: "asset://rocks/copper.glb",
      depletedModelPath: "asset://rocks/depleted.glb",
      scale: 1,
      depletedScale: 1,
      harvestSkill: "mining",
      toolRequired: "pickaxe",
      levelRequired: 1,
      baseCycleTicks: 3,
      depleteChance: 0.5,
      respawnTicks: 10,
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
    {
      id: "rock_essence",
      name: "Rune Essence",
      type: "ore",
      examine: "Shimmers faintly.",
      modelPath: "asset://rocks/essence.glb",
      depletedModelPath: null,
      scale: 1,
      depletedScale: 1,
      harvestSkill: "mining",
      toolRequired: "pickaxe",
      levelRequired: 1,
      baseCycleTicks: 3,
      // 0/0 = never depletes
      depleteChance: 0,
      respawnTicks: 0,
      harvestYield: [
        {
          itemId: "rune_essence",
          itemName: "Rune Essence",
          quantity: 1,
          chance: 1,
          xpAmount: 5,
          stackable: true,
        },
      ],
    },
  ],
};

const fishing: FishingManifest = {
  $schema: "../schemas/gathering-fishing.schema.json",
  spots: [
    {
      id: "fishing_spot_shrimp",
      name: "Shrimp Spot",
      type: "fishing_spot",
      examine: "You can see fish darting in the water.",
      modelPath: null,
      depletedModelPath: null,
      scale: 1,
      depletedScale: 1,
      harvestSkill: "fishing",
      toolRequired: "small_net",
      levelRequired: 1,
      baseCycleTicks: 5,
      depleteChance: 0.1,
      respawnTicks: 30,
      harvestYield: [
        {
          itemId: "raw_shrimp",
          itemName: "Raw Shrimp",
          quantity: 1,
          chance: 1,
          xpAmount: 10,
          stackable: false,
          levelRequired: 1,
          catchLow: 64,
          catchHigh: 128,
        },
      ],
    },
  ],
};

describe("WoodcuttingManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = WoodcuttingManifestSchema.safeParse(woodcutting);
    if (!result.success) {
      throw new Error(
        `Woodcutting reference failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects an empty trees array", () => {
    const bad = { ...woodcutting, trees: [] as never };
    const result = WoodcuttingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects depleteChance outside [0, 1]", () => {
    const bad = {
      ...woodcutting,
      trees: [{ ...woodcutting.trees[0], depleteChance: 1.5 }],
    };
    const result = WoodcuttingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects unknown harvestSkill", () => {
    const bad = {
      ...woodcutting,
      trees: [{ ...woodcutting.trees[0], harvestSkill: "cooking" }],
    };
    const result = WoodcuttingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("MiningManifestSchema", () => {
  it("parses the reference manifest cleanly (incl. 0/0 respawn essence rock)", () => {
    const result = MiningManifestSchema.safeParse(mining);
    if (!result.success) {
      throw new Error(
        `Mining reference failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects negative respawnTicks", () => {
    const bad = {
      ...mining,
      rocks: [{ ...mining.rocks[0], respawnTicks: -1 }],
    };
    const result = MiningManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a yield row with non-positive quantity", () => {
    const bad = {
      ...mining,
      rocks: [
        {
          ...mining.rocks[0],
          harvestYield: [{ ...mining.rocks[0].harvestYield[0], quantity: 0 }],
        },
      ],
    };
    const result = MiningManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("FishingManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = FishingManifestSchema.safeParse(fishing);
    if (!result.success) {
      throw new Error(
        `Fishing reference failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects catchHigh above 256", () => {
    const bad = {
      ...fishing,
      spots: [
        {
          ...fishing.spots[0],
          harvestYield: [
            { ...fishing.spots[0].harvestYield[0], catchHigh: 300 },
          ],
        },
      ],
    };
    const result = FishingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a fishing yield with levelRequired <= 0", () => {
    const bad = {
      ...fishing,
      spots: [
        {
          ...fishing.spots[0],
          harvestYield: [
            { ...fishing.spots[0].harvestYield[0], levelRequired: 0 },
          ],
        },
      ],
    };
    const result = FishingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("GatheringResource optional / null-bearing fields", () => {
  it("accepts lod1ModelPath and lod2ModelPath", () => {
    const augmented = {
      ...mining,
      rocks: [
        {
          ...mining.rocks[0],
          lod1ModelPath: "rocks/copper.lod1.glb",
          lod2ModelPath: null,
        },
      ],
    };
    const result = MiningManifestSchema.safeParse(augmented);
    expect(result.success).toBe(true);
  });

  it("accepts procgenPreset in place of a static modelPath", () => {
    const augmented = {
      ...woodcutting,
      trees: [
        {
          ...woodcutting.trees[0],
          modelPath: null,
          procgenPreset: "blackOak",
        },
      ],
    };
    const result = WoodcuttingManifestSchema.safeParse(augmented);
    expect(result.success).toBe(true);
  });

  it("accepts secondaryRequired on fishing spots", () => {
    const augmented = {
      ...fishing,
      spots: [
        {
          ...fishing.spots[0],
          secondaryRequired: "fishing_bait",
        },
      ],
    };
    const result = FishingManifestSchema.safeParse(augmented);
    expect(result.success).toBe(true);
  });

  it("accepts toolRequired: null (implicit tool)", () => {
    const augmented = {
      ...fishing,
      spots: [
        {
          ...fishing.spots[0],
          toolRequired: null,
        },
      ],
    };
    const result = FishingManifestSchema.safeParse(augmented);
    expect(result.success).toBe(true);
  });

  it("rejects empty toolRequired string (still must be non-empty when set)", () => {
    const bad = {
      ...fishing,
      spots: [
        {
          ...fishing.spots[0],
          toolRequired: "",
        },
      ],
    };
    const result = FishingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
