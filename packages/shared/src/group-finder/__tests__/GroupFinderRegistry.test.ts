import { GroupFinderManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  GroupFinderNotLoadedError,
  GroupFinderRegistry,
  UnknownGroupFinderContentError,
} from "../GroupFinderRegistry.js";

function manifest() {
  return GroupFinderManifestSchema.parse({
    enabled: true,
    content: [
      {
        id: "dungeonA",
        name: "Dungeon A",
        kind: "dungeon",
        minGroupSize: 5,
        maxGroupSize: 5,
        roleRequirements: [
          { role: "tank", count: 1 },
          { role: "healer", count: 1 },
          { role: "dps", count: 3 },
        ],
        queuePolicy: "specific",
        minLevel: 10,
        maxLevel: 20,
        minGearScore: 100,
        estimatedDurationMinutes: 20,
      },
      {
        id: "arena2v2",
        name: "Arena 2v2",
        kind: "arena",
        minGroupSize: 2,
        maxGroupSize: 2,
        roleRequirements: [{ role: "dps", count: 2 }],
        queuePolicy: "ranked",
        minLevel: 30,
        maxLevel: 100,
        minRating: 1500,
        estimatedDurationMinutes: 10,
      },
      {
        id: "scenarioB",
        name: "Scenario B",
        kind: "scenario",
        minGroupSize: 3,
        maxGroupSize: 3,
        queuePolicy: "random",
        minLevel: 5,
        maxLevel: 50,
      },
    ],
    matchmaking: {
      queueTimeoutSec: 600,
      readyCheckTimeoutSec: 30,
      backfillEnabled: true,
      applyDeserterPenalty: true,
      deserterCooldownSec: 300,
      wideningAfterMinutes: 5,
    },
  });
}

describe("GroupFinderRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new GroupFinderRegistry().manifest).toThrow(
      GroupFinderNotLoadedError,
    );
  });
});

describe("GroupFinderRegistry — content", () => {
  it("indexes by id", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(r.has("dungeonA")).toBe(true);
    expect(r.get("arena2v2").kind).toBe("arena");
  });

  it("throws on unknown content", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownGroupFinderContentError);
  });

  it("filters by kind", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(r.byKind("dungeon").map((c) => c.id)).toEqual(["dungeonA"]);
    expect(r.byKind("arena").map((c) => c.id)).toEqual(["arena2v2"]);
  });

  it("filters by queue policy", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(r.byQueuePolicy("ranked").map((c) => c.id)).toEqual(["arena2v2"]);
    expect(r.byQueuePolicy("random").map((c) => c.id)).toEqual(["scenarioB"]);
  });

  it("exposes role counts", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(r.roleCount("dungeonA", "tank")).toBe(1);
    expect(r.roleCount("dungeonA", "dps")).toBe(3);
    expect(r.roleCount("dungeonA", "support")).toBe(0);
    expect(r.totalRoleSlots("dungeonA")).toBe(5);
    expect(r.totalRoleSlots("scenarioB")).toBe(0);
  });
});

describe("GroupFinderRegistry — eligibility", () => {
  const baseInput = {
    characterLevel: 15,
    gearScore: 200,
    rating: 0,
    queuedMinutes: 0,
  };

  it("allows valid queue", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(r.checkEligibility("dungeonA", baseInput).allowed).toBe(true);
  });

  it("rejects below level", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(
      r.checkEligibility("dungeonA", { ...baseInput, characterLevel: 5 })
        .reason,
    ).toBe("below-level");
  });

  it("rejects above level", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(
      r.checkEligibility("dungeonA", { ...baseInput, characterLevel: 30 })
        .reason,
    ).toBe("above-level");
  });

  it("rejects below gear score", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(
      r.checkEligibility("dungeonA", { ...baseInput, gearScore: 50 }).reason,
    ).toBe("below-gear-score");
  });

  it("widens after queue time", () => {
    const r = new GroupFinderRegistry(manifest());
    // wideningAfterMinutes=5, gearScore=49 still under widened 50
    expect(
      r.checkEligibility("dungeonA", {
        ...baseInput,
        gearScore: 49,
        queuedMinutes: 6,
      }).reason,
    ).toBe("below-gear-score");
    // 51 passes widened gate (100/2=50, >=50 is allowed)
    expect(
      r.checkEligibility("dungeonA", {
        ...baseInput,
        gearScore: 51,
        queuedMinutes: 6,
      }).allowed,
    ).toBe(true);
    // widened min level of 1 allows low-level
    expect(
      r.checkEligibility("dungeonA", {
        characterLevel: 2,
        gearScore: 200,
        rating: 0,
        queuedMinutes: 6,
      }).allowed,
    ).toBe(true);
  });

  it("rejects below rating for ranked", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(
      r.checkEligibility("arena2v2", {
        characterLevel: 50,
        gearScore: 0,
        rating: 1000,
        queuedMinutes: 0,
      }).reason,
    ).toBe("below-rating");

    expect(
      r.checkEligibility("arena2v2", {
        characterLevel: 50,
        gearScore: 0,
        rating: 1500,
        queuedMinutes: 0,
      }).allowed,
    ).toBe(true);
  });
});

describe("GroupFinderRegistry — matchmaking helpers", () => {
  it("queue timeout", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(r.isQueueExpired(599)).toBe(false);
    expect(r.isQueueExpired(600)).toBe(true);
  });

  it("ready-check timeout", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(r.isReadyCheckExpired(29)).toBe(false);
    expect(r.isReadyCheckExpired(30)).toBe(true);
  });

  it("deserter cooldown", () => {
    const r = new GroupFinderRegistry(manifest());
    expect(r.isDeserterOnCooldown(100)).toBe(true);
    expect(r.isDeserterOnCooldown(300)).toBe(false);
  });

  it("no cooldown when penalty disabled", () => {
    const r = new GroupFinderRegistry();
    r.loadFromJson({
      enabled: true,
      content: [
        {
          id: "x",
          name: "X",
          kind: "dungeon",
          minGroupSize: 1,
          maxGroupSize: 1,
        },
      ],
      matchmaking: {
        applyDeserterPenalty: false,
      },
    });
    expect(r.isDeserterOnCooldown(0)).toBe(false);
  });
});
