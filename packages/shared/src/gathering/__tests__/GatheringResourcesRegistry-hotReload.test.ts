/**
 * Hot-reload tests for `GatheringResourcesRegistry`.
 *
 * Verifies that calling `loadWoodcutting` / `loadMining` / `loadFishing`
 * after a prior load clears the previous entries and re-populates from
 * the new manifest — the same semantics `PIEEditorSession.updateManifests`
 * relies on to push editor edits into a running PIE session without a
 * Stop → Play cycle.
 */

import { describe, expect, it } from "vitest";

import type {
  WoodcuttingManifest,
  MiningManifest,
  FishingManifest,
} from "@hyperforge/manifest-schema";

import {
  GatheringResourcesRegistry,
  UnknownResourceError,
} from "../GatheringResourcesRegistry.js";

const tree = (id: string, level = 1): WoodcuttingManifest => ({
  trees: [
    {
      id,
      name: `${id} tree`,
      type: "tree",
      examine: "",
      modelPath: null,
      depletedModelPath: null,
      scale: 1,
      depletedScale: 1,
      harvestSkill: "woodcutting",
      toolRequired: "bronze_axe",
      levelRequired: level,
      baseCycleTicks: 3,
      depleteChance: 0,
      respawnTicks: 0,
      harvestYield: [
        {
          itemId: "logs",
          itemName: "Logs",
          quantity: 1,
          chance: 1,
          xpAmount: 25,
          stackable: false,
        },
      ],
    },
  ],
});

const rock = (id: string): MiningManifest => ({
  rocks: [
    {
      id,
      name: `${id} rock`,
      type: "ore",
      examine: "",
      modelPath: null,
      depletedModelPath: null,
      scale: 1,
      depletedScale: 1,
      harvestSkill: "mining",
      toolRequired: "bronze_pickaxe",
      levelRequired: 1,
      baseCycleTicks: 3,
      depleteChance: 0.5,
      respawnTicks: 10,
      harvestYield: [
        {
          itemId: "ore",
          itemName: "Ore",
          quantity: 1,
          chance: 1,
          xpAmount: 17.5,
          stackable: false,
        },
      ],
    },
  ],
});

const fish = (id: string): FishingManifest => ({
  spots: [
    {
      id,
      name: `${id} spot`,
      type: "fishing_spot",
      examine: "",
      modelPath: null,
      depletedModelPath: null,
      scale: 1,
      depletedScale: 1,
      harvestSkill: "fishing",
      toolRequired: "small_net",
      levelRequired: 1,
      baseCycleTicks: 5,
      depleteChance: 0,
      respawnTicks: 0,
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
});

describe("GatheringResourcesRegistry hot-reload", () => {
  it("woodcutting reload replaces the prior trees set", () => {
    const r = new GatheringResourcesRegistry();
    r.loadWoodcutting(tree("oak", 15));
    expect(r.hasTree("oak")).toBe(true);
    expect(r.tree("oak").levelRequired).toBe(15);

    // Reload with a brand-new manifest — old id must vanish.
    r.loadWoodcutting(tree("willow", 30));
    expect(r.hasTree("oak")).toBe(false);
    expect(() => r.tree("oak")).toThrow(UnknownResourceError);
    expect(r.hasTree("willow")).toBe(true);
    expect(r.tree("willow").levelRequired).toBe(30);
  });

  it("woodcutting reload with an edited same-id tree overwrites fields", () => {
    const r = new GatheringResourcesRegistry();
    r.loadWoodcutting(tree("oak", 15));
    r.loadWoodcutting(tree("oak", 45));
    expect(r.tree("oak").levelRequired).toBe(45);
  });

  it("mining and fishing reloads work independently of woodcutting", () => {
    const r = new GatheringResourcesRegistry();
    r.loadWoodcutting(tree("oak"));
    r.loadMining(rock("copper"));
    r.loadFishing(fish("shrimp"));

    // Reload only mining — trees and spots must be untouched.
    r.loadMining(rock("tin"));
    expect(r.hasTree("oak")).toBe(true);
    expect(r.hasFishingSpot("shrimp")).toBe(true);
    expect(r.hasRock("copper")).toBe(false);
    expect(r.hasRock("tin")).toBe(true);

    // Reload only fishing — trees and rocks must be untouched.
    r.loadFishing(fish("lobster"));
    expect(r.hasTree("oak")).toBe(true);
    expect(r.hasRock("tin")).toBe(true);
    expect(r.hasFishingSpot("shrimp")).toBe(false);
    expect(r.hasFishingSpot("lobster")).toBe(true);
  });

  it("findResource reflects the latest post-reload state across skills", () => {
    const r = new GatheringResourcesRegistry();
    r.loadWoodcutting(tree("oak"));
    r.loadMining(rock("copper"));
    expect(r.findResource("oak")?.id).toBe("oak");
    expect(r.findResource("copper")?.id).toBe("copper");

    r.loadWoodcutting(tree("willow"));
    expect(r.findResource("oak")).toBeNull();
    expect(r.findResource("willow")?.id).toBe("willow");
    // Mining untouched.
    expect(r.findResource("copper")?.id).toBe("copper");
  });

  it("requiringTool reflects the latest post-reload state", () => {
    const r = new GatheringResourcesRegistry();
    r.loadWoodcutting(tree("oak"));
    expect(r.requiringTool("bronze_axe").map((x) => x.id)).toEqual(["oak"]);

    r.loadWoodcutting(tree("willow"));
    expect(r.requiringTool("bronze_axe").map((x) => x.id)).toEqual(["willow"]);
  });
});
