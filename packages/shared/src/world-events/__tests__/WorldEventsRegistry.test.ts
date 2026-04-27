import { WorldEventsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  UnknownPhaseError,
  UnknownWorldEventError,
  WorldEventsNotLoadedError,
  WorldEventsRegistry,
} from "../WorldEventsRegistry.js";

function manifest() {
  return WorldEventsManifestSchema.parse([
    {
      id: "goblinRaid",
      name: "Goblin Raid",
      category: "invasion",
      trigger: { kind: "schedule", intervalMinutes: 60, jitterMinutes: 10 },
      minPlayers: 5,
      maxPlayers: 40,
      minLevel: 5,
      maxLevel: 30,
      zoneId: "lowland",
      phases: [
        {
          id: "gather",
          name: "Gather",
          durationSec: 60,
          nextOnSuccess: "fight",
        },
        {
          id: "fight",
          name: "Fight",
          durationSec: 300,
          nextOnSuccess: "",
          nextOnFailure: "",
        },
      ],
      startPhaseId: "gather",
      participationTiers: [
        {
          id: "bronze",
          name: "Bronze",
          minContribution: 0.1,
          lootTableId: "goblinBronze",
          xpReward: 100,
        },
        {
          id: "silver",
          name: "Silver",
          minContribution: 0.33,
          lootTableId: "goblinSilver",
          xpReward: 300,
        },
        {
          id: "gold",
          name: "Gold",
          minContribution: 0.66,
          lootTableId: "goblinGold",
          xpReward: 1000,
        },
      ],
      rewardLockoutHours: 2,
    },
    {
      id: "stoneBoss",
      name: "Stone Boss",
      category: "boss",
      trigger: { kind: "random", chancePerRoll: 0.1, rollIntervalSec: 600 },
      minPlayers: 10,
      maxPlayers: 40,
      minLevel: 20,
      maxLevel: 50,
      zoneId: "mountains",
      phases: [
        {
          id: "summon",
          name: "Summon",
          nextOnSuccess: "",
        },
      ],
      startPhaseId: "summon",
      participationTiers: [
        {
          id: "p",
          name: "Participant",
          minContribution: 0,
          lootTableId: "stoneBossLoot",
        },
      ],
    },
    {
      id: "goblinFollowup",
      name: "Followup",
      category: "invasion",
      trigger: {
        kind: "chain",
        sourceEventId: "goblinRaid",
        delaySec: 120,
      },
      zoneId: "lowland",
      phases: [{ id: "x", name: "X", nextOnSuccess: "" }],
      startPhaseId: "x",
      participationTiers: [
        {
          id: "p",
          name: "P",
          minContribution: 0,
          lootTableId: "chainLoot",
        },
      ],
    },
  ]);
}

describe("WorldEventsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new WorldEventsRegistry().manifest).toThrow(
      WorldEventsNotLoadedError,
    );
  });
});

describe("WorldEventsRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.has("goblinRaid")).toBe(true);
    expect(r.get("stoneBoss").category).toBe("boss");
  });

  it("throws on unknown id", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownWorldEventError);
  });

  it("filters by category", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.byCategory("invasion").map((e) => e.id)).toEqual([
      "goblinRaid",
      "goblinFollowup",
    ]);
    expect(r.byCategory("boss").map((e) => e.id)).toEqual(["stoneBoss"]);
  });

  it("filters by trigger kind", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.byTriggerKind("schedule").map((e) => e.id)).toEqual([
      "goblinRaid",
    ]);
    expect(r.byTriggerKind("chain").map((e) => e.id)).toEqual([
      "goblinFollowup",
    ]);
  });

  it("filters by zone", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.byZone("lowland").map((e) => e.id)).toEqual([
      "goblinRaid",
      "goblinFollowup",
    ]);
  });
});

describe("WorldEventsRegistry — phases", () => {
  it("returns start phase", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.startPhase("goblinRaid").id).toBe("gather");
  });

  it("walks success chain", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.nextPhase("goblinRaid", "gather", "success")?.id).toBe("fight");
  });

  it("returns null at terminal branch", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.nextPhase("goblinRaid", "fight", "success")).toBeNull();
    expect(r.nextPhase("goblinRaid", "fight", "failure")).toBeNull();
  });

  it("throws on unknown phase id", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(() => r.phase("goblinRaid", "ghost")).toThrow(UnknownPhaseError);
  });
});

describe("WorldEventsRegistry — participation tiers", () => {
  it("returns null below lowest tier", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.resolveParticipationTier("goblinRaid", 0.05)).toBeNull();
  });

  it("returns bronze at threshold", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.resolveParticipationTier("goblinRaid", 0.1)?.id).toBe("bronze");
  });

  it("returns highest qualifying tier", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.resolveParticipationTier("goblinRaid", 0.5)?.id).toBe("silver");
    expect(r.resolveParticipationTier("goblinRaid", 0.9)?.id).toBe("gold");
  });
});

describe("WorldEventsRegistry — eligibility", () => {
  const baseInput = {
    characterLevel: 20,
    hoursSinceLastReward: 10,
  };

  it("allows valid", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.checkEligibility("goblinRaid", baseInput).allowed).toBe(true);
  });

  it("rejects below level", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(
      r.checkEligibility("goblinRaid", { ...baseInput, characterLevel: 2 })
        .reason,
    ).toBe("below-level");
  });

  it("rejects above level", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(
      r.checkEligibility("goblinRaid", { ...baseInput, characterLevel: 50 })
        .reason,
    ).toBe("above-level");
  });

  it("rejects reward lockout", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(
      r.checkEligibility("goblinRaid", {
        ...baseInput,
        hoursSinceLastReward: 1,
      }).reason,
    ).toBe("reward-lockout");
  });

  it("reports event-not-found", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.checkEligibility("ghost", baseInput).reason).toBe(
      "event-not-found",
    );
  });
});

describe("WorldEventsRegistry — schedule math", () => {
  it("computes schedule average", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(r.averageScheduleIntervalSec("goblinRaid")).toBe(3600);
  });

  it("throws for wrong trigger kind", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(() => r.averageScheduleIntervalSec("stoneBoss")).toThrow();
  });

  it("computes random expected interval (geometric mean)", () => {
    const r = new WorldEventsRegistry(manifest());
    // 600 / 0.1 = 6000
    expect(r.expectedRandomIntervalSec("stoneBoss")).toBe(6000);
  });

  it("throws for wrong kind on random math", () => {
    const r = new WorldEventsRegistry(manifest());
    expect(() => r.expectedRandomIntervalSec("goblinRaid")).toThrow();
  });
});

describe("WorldEventsRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new WorldEventsRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new WorldEventsRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new WorldEventsRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
