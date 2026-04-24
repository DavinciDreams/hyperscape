/**
 * Faithfulness test: a gathering manifest built from the values currently
 * hardcoded in `packages/shared/src/constants/GatheringConstants.ts` MUST
 * parse cleanly.
 */

import { describe, expect, it } from "vitest";

import {
  GatheringManifestSchema,
  type GatheringManifest,
} from "./gathering.js";

const hyperscapeGatheringManifest: GatheringManifest = {
  $schema: "hyperforge.gathering.v1",
  skillMechanics: {
    woodcutting: {
      type: "fixed-roll-variable-success",
      baseRollTicks: 4,
      toolAffectsSuccess: true,
      toolAffectsSpeed: false,
    },
    mining: {
      type: "variable-roll-fixed-success",
      baseRollTicks: 8,
      toolAffectsSuccess: false,
      toolAffectsSpeed: true,
    },
    fishing: {
      type: "fixed-roll-fixed-success",
      baseRollTicks: 5,
      toolAffectsSuccess: false,
      toolAffectsSpeed: false,
    },
  },
  ranges: {
    gatheringRange: 1,
    proximitySearchRadius: 15,
    defaultInteractionRange: 4.0,
    positionEpsilon: 0.01,
  },
  timing: {
    minimumCycleTicks: 2,
    rateLimitMs: 600,
    staleRateLimitMs: 10000,
    rateLimitCleanupIntervalMs: 60000,
    timerRegenPerTick: 1,
  },
  woodcuttingSuccessRates: {
    tree_normal: {
      bronze: { low: 64, high: 200 },
      iron: { low: 96, high: 256 },
      steel: { low: 142, high: 256 },
      mithril: { low: 160, high: 256 },
      adamant: { low: 192, high: 256 },
      rune: { low: 224, high: 256 },
      dragon: { low: 240, high: 256 },
      crystal: { low: 248, high: 256 },
    },
    tree_oak: {
      bronze: { low: 32, high: 100 },
      iron: { low: 48, high: 130 },
      steel: { low: 64, high: 160 },
      mithril: { low: 80, high: 190 },
      adamant: { low: 96, high: 220 },
      rune: { low: 112, high: 245 },
      dragon: { low: 128, high: 256 },
      crystal: { low: 140, high: 256 },
    },
    tree_willow: {
      bronze: { low: 24, high: 80 },
      iron: { low: 36, high: 100 },
      steel: { low: 48, high: 120 },
      mithril: { low: 60, high: 150 },
      adamant: { low: 72, high: 180 },
      rune: { low: 84, high: 210 },
      dragon: { low: 96, high: 240 },
      crystal: { low: 108, high: 256 },
    },
  },
  miningSuccessRates: {
    ore_copper: { low: 100, high: 256 },
    ore_tin: { low: 100, high: 256 },
    ore_iron: { low: 133, high: 256 },
    ore_coal: { low: 42, high: 101 },
    ore_mithril: { low: 30, high: 51 },
    ore_adamant: { low: 19, high: 26 },
    ore_runite: { low: 17, high: 19 },
  },
  fishingSuccessRates: {
    fishing_spot_net: { low: 48, high: 180 },
    fishing_spot_bait: { low: 45, high: 170 },
    fishing_spot_fly: { low: 40, high: 150 },
    fishing_spot_normal: { low: 48, high: 180 },
  },
  defaultSuccessRate: { low: 48, high: 180 },
  resourceIdRules: {
    maxLength: 100,
    validPattern: "^[a-zA-Z0-9_.-]+$",
  },
  treeDespawnTicks: {
    tree: 0,
    oak: 45,
    willow: 50,
    teak: 50,
    maple: 100,
    yew: 190,
    magic: 390,
    redwood: 440,
  },
  treeRespawnTicks: {
    tree: 10,
    oak: 14,
    willow: 14,
    teak: 15,
    maple: 59,
    yew: 100,
    magic: 199,
    redwood: 199,
  },
  fishingSpotMove: {
    baseTicks: 300,
    varianceTicks: 100,
    relocateRadius: 3,
    relocateMinDistance: 1,
  },
};

describe("GatheringManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = GatheringManifestSchema.safeParse(
      hyperscapeGatheringManifest,
    );
    if (!result.success) {
      throw new Error(
        `Hyperscape reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects wrong schema version", () => {
    const wrong = {
      ...hyperscapeGatheringManifest,
      $schema: "hyperforge.gathering.v0",
    };
    const result = GatheringManifestSchema.safeParse(wrong);
    expect(result.success).toBe(false);
  });

  it("rejects success rate above 256", () => {
    const bad: GatheringManifest = {
      ...hyperscapeGatheringManifest,
      defaultSuccessRate: { low: 0, high: 257 },
    };
    const result = GatheringManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects unknown skill type", () => {
    const bad = {
      ...hyperscapeGatheringManifest,
      skillMechanics: {
        ...hyperscapeGatheringManifest.skillMechanics,
        woodcutting: {
          ...hyperscapeGatheringManifest.skillMechanics.woodcutting,
          type: "bogus-mechanic",
        },
      },
    };
    const result = GatheringManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
