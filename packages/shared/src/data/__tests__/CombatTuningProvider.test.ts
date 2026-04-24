/**
 * Tests for the CombatTuningProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { combatTuningProvider } from "../CombatTuningProvider";

// Reset singleton state before AND after every test so cross-file leak
// can't pollute the "starts unloaded" assertions.
beforeEach(() => {
  combatTuningProvider.unload();
});
afterEach(() => {
  combatTuningProvider.unload();
});

const validManifest = [
  {
    id: "default",
    name: "Default",
    description: "",
    tickMs: 600,
    hpThresholdsPct: { heal: 40, aggressive: 70, defensive: 30 },
    offensivePrayers: {
      melee: "superhuman_strength",
      ranged: "hawk_eye",
      mage: "mystic_lore",
    },
    defensivePrayer: "rock_skin",
    engagementRanges: {
      melee: { min: 0.8, max: 1.8 },
      ranged: { min: 5, max: 8 },
      mage: { min: 5, max: 8 },
    },
    movement: { moveCooldownMs: 1200, strafeStep: 1.35 },
    noFood: false,
    useLlmTactics: false,
  },
];

describe("CombatTuningProvider", () => {
  it("starts unloaded with an empty profiles list", () => {
    expect(combatTuningProvider.isLoaded()).toBe(false);
    expect(combatTuningProvider.getProfiles()).toEqual([]);
    expect(combatTuningProvider.getManifest()).toBeNull();
  });

  it("load() installs a validated manifest", () => {
    combatTuningProvider.load(validManifest);
    expect(combatTuningProvider.isLoaded()).toBe(true);
    expect(combatTuningProvider.getProfiles().length).toBe(1);
  });

  it("loadRaw() validates raw JSON and rejects invalid manifests", () => {
    // Duplicate ids trip the schema-level refinement.
    expect(() =>
      combatTuningProvider.loadRaw([validManifest[0], { ...validManifest[0] }]),
    ).toThrow();
    expect(combatTuningProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts and installs a valid raw payload", () => {
    const parsed = combatTuningProvider.loadRaw(validManifest);
    expect(parsed).toEqual(validManifest);
    expect(combatTuningProvider.isLoaded()).toBe(true);
    expect(combatTuningProvider.getProfiles()).toEqual(validManifest);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    combatTuningProvider.load(validManifest);
    const second = [{ ...validManifest[0], id: "boss" }];
    combatTuningProvider.hotReload(second);
    expect(combatTuningProvider.getProfiles()).toEqual(second);
  });

  it("hotReload(null) clears the authored list", () => {
    combatTuningProvider.load(validManifest);
    combatTuningProvider.hotReload(null);
    expect(combatTuningProvider.isLoaded()).toBe(false);
    expect(combatTuningProvider.getProfiles()).toEqual([]);
  });

  it("unload() resets to the default empty state", () => {
    combatTuningProvider.load(validManifest);
    combatTuningProvider.unload();
    expect(combatTuningProvider.isLoaded()).toBe(false);
    expect(combatTuningProvider.getProfiles()).toEqual([]);
    expect(combatTuningProvider.getManifest()).toBeNull();
  });

  it("getProfiles() returns an empty array (not null) when unloaded — safe to iterate", () => {
    const profiles = combatTuningProvider.getProfiles();
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles.length).toBe(0);
  });
});
