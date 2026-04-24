/**
 * Tests for the FactionsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { factionsProvider } from "../FactionsProvider";

beforeEach(() => {
  factionsProvider.unload();
});
afterEach(() => {
  factionsProvider.unload();
});

const validManifest = {
  factions: [
    {
      id: "stormwind",
      name: "Stormwind Guard",
      startingStanding: 0,
      tiers: [
        { id: "hated", name: "Hated", minStanding: -1000, maxStanding: -500 },
        {
          id: "hostile",
          name: "Hostile",
          minStanding: -500,
          maxStanding: 0,
          npcsAttackOnSight: true,
        },
        {
          id: "neutral",
          name: "Neutral",
          minStanding: 0,
          maxStanding: 500,
        },
        {
          id: "friendly",
          name: "Friendly",
          minStanding: 500,
          maxStanding: 2000,
          vendorPriceMultiplier: 0.9,
          questsUnlocked: true,
          shopUnlocked: true,
        },
      ],
    },
    {
      id: "orgrimmar",
      name: "Orgrimmar Legion",
      startingStanding: -250,
      tiers: [
        { id: "hostile", name: "Hostile", minStanding: -500, maxStanding: 0 },
        { id: "neutral", name: "Neutral", minStanding: 0, maxStanding: 500 },
      ],
    },
  ],
  relationships: [
    {
      a: "stormwind",
      b: "orgrimmar",
      disposition: "at-war" as const,
      mutuallyExclusiveRep: true,
    },
  ],
};

describe("FactionsProvider", () => {
  it("starts unloaded", () => {
    expect(factionsProvider.isLoaded()).toBe(false);
    expect(factionsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = factionsProvider.loadRaw(validManifest);
    expect(parsed.factions.length).toBe(2);
    expect(parsed.factions[0].tiers[2].vendorPriceMultiplier).toBe(1);
    expect(parsed.factions[0].playerJoinable).toBe(false);
    expect(parsed.factions[0].hidden).toBe(false);
    expect(parsed.relationships.length).toBe(1);
    expect(factionsProvider.isLoaded()).toBe(true);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = factionsProvider.loadRaw(validManifest);
    factionsProvider.unload();
    factionsProvider.load(parsed);
    expect(factionsProvider.isLoaded()).toBe(true);
    expect(factionsProvider.getManifest()?.factions.length).toBe(2);
  });

  it("loadRaw() rejects empty factions array", () => {
    expect(() => factionsProvider.loadRaw({ factions: [] })).toThrow();
    expect(factionsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate faction ids", () => {
    const bad = {
      factions: [
        {
          id: "dup",
          name: "A",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
        {
          id: "dup",
          name: "B",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
    };
    expect(() => factionsProvider.loadRaw(bad)).toThrow();
    expect(factionsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects tiers with gaps", () => {
    const bad = {
      factions: [
        {
          id: "f",
          name: "F",
          tiers: [
            { id: "a", name: "A", minStanding: 0, maxStanding: 100 },
            { id: "b", name: "B", minStanding: 200, maxStanding: 300 },
          ],
        },
      ],
    };
    expect(() => factionsProvider.loadRaw(bad)).toThrow();
    expect(factionsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects tiers with overlap", () => {
    const bad = {
      factions: [
        {
          id: "f",
          name: "F",
          tiers: [
            { id: "a", name: "A", minStanding: 0, maxStanding: 150 },
            { id: "b", name: "B", minStanding: 100, maxStanding: 250 },
          ],
        },
      ],
    };
    expect(() => factionsProvider.loadRaw(bad)).toThrow();
    expect(factionsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects startingStanding outside any tier", () => {
    const bad = {
      factions: [
        {
          id: "f",
          name: "F",
          startingStanding: 9999,
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
    };
    expect(() => factionsProvider.loadRaw(bad)).toThrow();
    expect(factionsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects relationship referencing an undeclared faction", () => {
    const bad = {
      factions: [
        {
          id: "f",
          name: "F",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
      relationships: [{ a: "f", b: "ghost", disposition: "hostile" }],
    };
    expect(() => factionsProvider.loadRaw(bad)).toThrow();
    expect(factionsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects relationship with a === b", () => {
    const bad = {
      factions: [
        {
          id: "f",
          name: "F",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
      relationships: [{ a: "f", b: "f", disposition: "neutral" }],
    };
    expect(() => factionsProvider.loadRaw(bad)).toThrow();
    expect(factionsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate unordered (a,b) relationship pairs", () => {
    const bad = {
      factions: [
        {
          id: "f1",
          name: "F1",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
        {
          id: "f2",
          name: "F2",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
      relationships: [
        { a: "f1", b: "f2", disposition: "friendly" },
        { a: "f2", b: "f1", disposition: "hostile" },
      ],
    };
    expect(() => factionsProvider.loadRaw(bad)).toThrow();
    expect(factionsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects malformed color regex", () => {
    const bad = {
      factions: [
        {
          id: "f",
          name: "F",
          color: "not-hex",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
    };
    expect(() => factionsProvider.loadRaw(bad)).toThrow();
    expect(factionsProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    factionsProvider.loadRaw(validManifest);
    const replacement = factionsProvider.loadRaw({
      factions: [
        {
          id: "only",
          name: "Only",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
    });
    factionsProvider.hotReload(replacement);
    expect(factionsProvider.getManifest()?.factions.length).toBe(1);
    expect(factionsProvider.getManifest()?.factions[0].id).toBe("only");
  });

  it("hotReload(null) clears", () => {
    factionsProvider.loadRaw(validManifest);
    factionsProvider.hotReload(null);
    expect(factionsProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    factionsProvider.loadRaw(validManifest);
    factionsProvider.unload();
    expect(factionsProvider.isLoaded()).toBe(false);
    expect(factionsProvider.getManifest()).toBeNull();
  });
});
