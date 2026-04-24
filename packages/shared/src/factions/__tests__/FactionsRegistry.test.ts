import { FactionsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  FactionsNotLoadedError,
  FactionsRegistry,
  UnknownFactionError,
} from "../FactionsRegistry.js";

function tier(
  id: string,
  min: number,
  max: number,
  extra: { vendorPriceMultiplier?: number; npcsAttackOnSight?: boolean } = {},
) {
  return {
    id,
    name: id,
    minStanding: min,
    maxStanding: max,
    vendorPriceMultiplier: extra.vendorPriceMultiplier ?? 1,
    npcsAttackOnSight: extra.npcsAttackOnSight ?? false,
    questsUnlocked: false,
    shopUnlocked: false,
  };
}

function manifest() {
  return FactionsManifestSchema.parse({
    factions: [
      {
        id: "varrock",
        name: "Varrock",
        startingStanding: 0,
        playerJoinable: true,
        tiers: [
          tier("hated", -1000, 0, { npcsAttackOnSight: true }),
          tier("neutral", 0, 1000),
          tier("liked", 1000, 5000),
        ],
      },
      {
        id: "kandarin",
        name: "Kandarin",
        startingStanding: 0,
        tiers: [
          tier("hated", -1000, 0, { npcsAttackOnSight: true }),
          tier("neutral", 0, 1000),
          tier("liked", 1000, 5000),
        ],
      },
      {
        id: "bandits",
        name: "Bandits",
        startingStanding: 0,
        tiers: [
          tier("hated", -1000, 0),
          tier("neutral", 0, 1000),
          tier("respected", 1000, 5000),
        ],
      },
    ],
    relationships: [
      {
        a: "varrock",
        b: "bandits",
        disposition: "at-war",
        mutuallyExclusiveRep: true,
      },
      {
        a: "varrock",
        b: "kandarin",
        disposition: "allied",
      },
    ],
  });
}

describe("FactionsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new FactionsRegistry().manifest).toThrow(
      FactionsNotLoadedError,
    );
  });
});

describe("FactionsRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new FactionsRegistry(manifest());
    expect(r.has("varrock")).toBe(true);
    expect(r.get("bandits").name).toBe("Bandits");
  });

  it("throws on unknown", () => {
    const r = new FactionsRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownFactionError);
  });

  it("playerJoinable filters", () => {
    const r = new FactionsRegistry(manifest());
    expect(r.playerJoinable().map((f) => f.id)).toEqual(["varrock"]);
  });
});

describe("FactionsRegistry — tier resolution", () => {
  it("zero standing → neutral tier", () => {
    const r = new FactionsRegistry(manifest());
    expect(r.tierForStanding("varrock", 0).id).toBe("neutral");
  });

  it("negative → hated", () => {
    const r = new FactionsRegistry(manifest());
    expect(r.tierForStanding("varrock", -500).id).toBe("hated");
  });

  it("above authored max clamps to top tier", () => {
    const r = new FactionsRegistry(manifest());
    expect(r.tierForStanding("varrock", 10_000).id).toBe("liked");
  });

  it("below authored min clamps to bottom tier", () => {
    const r = new FactionsRegistry(manifest());
    expect(r.tierForStanding("varrock", -5000).id).toBe("hated");
  });
});

describe("FactionsRegistry — dispositions", () => {
  it("same faction → allied", () => {
    const r = new FactionsRegistry(manifest());
    expect(r.disposition("varrock", "varrock").disposition).toBe("allied");
  });

  it("explicit relationship", () => {
    const r = new FactionsRegistry(manifest());
    expect(r.disposition("varrock", "bandits").disposition).toBe("at-war");
    expect(r.disposition("bandits", "varrock").disposition).toBe("at-war");
  });

  it("unrelated defaults to neutral", () => {
    const r = new FactionsRegistry(manifest());
    expect(r.disposition("kandarin", "bandits").disposition).toBe("neutral");
  });
});

describe("FactionsRegistry — propagateStandingDelta", () => {
  it("mutually exclusive cascades negative", () => {
    const r = new FactionsRegistry(manifest());
    const out = r.propagateStandingDelta("varrock", 100);
    expect(out.get("varrock")).toBe(100);
    expect(out.get("bandits")).toBe(-100);
    expect(out.has("kandarin")).toBe(false);
  });

  it("non-mutually-exclusive does not cascade", () => {
    const r = new FactionsRegistry(manifest());
    const out = r.propagateStandingDelta("kandarin", 100);
    expect(out.size).toBe(1);
    expect(out.get("kandarin")).toBe(100);
  });
});
