/**
 * Faithfulness + defensiveness tests for `GroupFinderManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  GroupFinderManifestSchema,
  type GroupFinderManifest,
} from "./group-finder.js";

const reference: GroupFinderManifest = {
  enabled: true,
  content: [
    {
      id: "dungeonFrostcaverns",
      name: "Frost Caverns",
      description: "Heroic dungeon in the northern peaks.",
      iconId: "",
      kind: "dungeon",
      minGroupSize: 5,
      maxGroupSize: 5,
      roleRequirements: [
        { role: "tank", count: 1 },
        { role: "healer", count: 1 },
        { role: "dps", count: 3 },
      ],
      queuePolicy: "specific",
      minLevel: 30,
      maxLevel: 40,
      minGearScore: 200,
      allowPartyPremade: true,
      estimatedDurationMinutes: 25,
      minRating: 0,
      lockoutBucketId: "dailyDungeon",
    },
    {
      id: "arenaRanked3v3",
      name: "Ranked Arena 3v3",
      description: "MMR-gated small-team PvP.",
      iconId: "",
      kind: "arena",
      minGroupSize: 3,
      maxGroupSize: 3,
      roleRequirements: [],
      queuePolicy: "ranked",
      minLevel: 50,
      maxLevel: 100,
      minGearScore: 500,
      allowPartyPremade: true,
      estimatedDurationMinutes: 15,
      minRating: 1500,
      lockoutBucketId: "",
    },
  ],
  matchmaking: {
    queueTimeoutSec: 1200,
    readyCheckTimeoutSec: 40,
    backfillEnabled: true,
    applyDeserterPenalty: true,
    deserterCooldownSec: 1800,
    roleIncentiveEnabled: true,
    wideningAfterMinutes: 10,
    allowCrossRealm: true,
    allowCrossFaction: false,
  },
  rewards: {
    firstDailyCompletionBonus: true,
    firstWeeklyCompletionBonus: true,
    completionSatchelEnabled: true,
    timeoutConsolationCurrency: 100,
    consolationCurrencyId: "gold",
    roleIncentiveSatchelEnabled: true,
  },
};

describe("GroupFinderManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = GroupFinderManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on disabled empty manifest", () => {
    const parsed = GroupFinderManifestSchema.parse({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.content).toEqual([]);
    expect(parsed.matchmaking.queueTimeoutSec).toBe(1200);
    expect(parsed.matchmaking.readyCheckTimeoutSec).toBe(40);
    expect(parsed.matchmaking.backfillEnabled).toBe(true);
    expect(parsed.matchmaking.allowCrossFaction).toBe(false);
    expect(parsed.rewards.firstDailyCompletionBonus).toBe(true);
    expect(parsed.rewards.timeoutConsolationCurrency).toBe(0);
    expect(parsed.rewards.consolationCurrencyId).toBe("gold");
  });

  it("rejects enabled=true with empty content", () => {
    const bad = { enabled: true, content: [] };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate content ids", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "dup",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
        },
        {
          id: "dup",
          name: "B",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects minGroupSize > maxGroupSize", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeon",
          minGroupSize: 10,
          maxGroupSize: 5,
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects minLevel > maxLevel", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
          minLevel: 80,
          maxLevel: 20,
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate role in roleRequirements", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
          roleRequirements: [
            { role: "dps", count: 2 },
            { role: "dps", count: 3 },
          ],
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects roleRequirements sum > maxGroupSize", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
          roleRequirements: [
            { role: "tank", count: 2 },
            { role: "healer", count: 2 },
            { role: "dps", count: 3 },
          ],
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts roleRequirements sum == maxGroupSize", () => {
    const ok = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
          roleRequirements: [
            { role: "tank", count: 1 },
            { role: "healer", count: 1 },
            { role: "dps", count: 3 },
          ],
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts empty roleRequirements (role-agnostic)", () => {
    const ok = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "battleground",
          minGroupSize: 10,
          maxGroupSize: 10,
          roleRequirements: [],
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects minRating>0 with non-ranked policy", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
          queuePolicy: "casual",
          minRating: 1500,
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts minRating>0 with ranked policy", () => {
    const ok = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "arena",
          minGroupSize: 3,
          maxGroupSize: 3,
          queuePolicy: "ranked",
          minRating: 1500,
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts minRating=0 with any policy", () => {
    const ok = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
          queuePolicy: "specific",
          minRating: 0,
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown content kind", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeonCrawl",
          minGroupSize: 5,
          maxGroupSize: 5,
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts all 7 content kinds", () => {
    const kinds = [
      "dungeon",
      "raid",
      "scenario",
      "battleground",
      "arena",
      "worldBoss",
      "custom",
    ];
    for (const k of kinds) {
      const ok = {
        enabled: true,
        content: [
          {
            id: `c${k}`,
            name: k,
            kind: k,
            minGroupSize: 1,
            maxGroupSize: 5,
          },
        ],
      };
      expect(GroupFinderManifestSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects unknown queue policy", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
          queuePolicy: "chaos",
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown role", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
          roleRequirements: [{ role: "wizard", count: 1 }],
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bad content id format", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "Not Valid",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects queueTimeoutSec < 30", () => {
    const bad = { enabled: false, matchmaking: { queueTimeoutSec: 5 } };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects queueTimeoutSec > 3600", () => {
    const bad = { enabled: false, matchmaking: { queueTimeoutSec: 99999 } };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects readyCheckTimeoutSec < 10", () => {
    const bad = {
      enabled: false,
      matchmaking: { readyCheckTimeoutSec: 5 },
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts deserterCooldownSec=0 (no penalty even if flag on)", () => {
    const ok = {
      enabled: false,
      matchmaking: { applyDeserterPenalty: true, deserterCooldownSec: 0 },
    };
    expect(GroupFinderManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts wideningAfterMinutes=0 (never widen)", () => {
    const ok = { enabled: false, matchmaking: { wideningAfterMinutes: 0 } };
    expect(GroupFinderManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects estimatedDurationMinutes > 480", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "raid",
          minGroupSize: 20,
          maxGroupSize: 20,
          estimatedDurationMinutes: 9999,
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects minGearScore > 10000", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
          minGearScore: 99999,
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bad consolation currency id format", () => {
    const bad = {
      enabled: false,
      rewards: { consolationCurrencyId: "Has Spaces" },
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts flex role", () => {
    const ok = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "dungeon",
          minGroupSize: 5,
          maxGroupSize: 5,
          roleRequirements: [{ role: "flex", count: 5 }],
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = { enabled: false, extra: "nope" };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown field on matchmaking (strict mode)", () => {
    const bad = { enabled: false, matchmaking: { extra: "nope" } };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts raid-sized content (40-player)", () => {
    const ok = {
      enabled: true,
      content: [
        {
          id: "raidOnyxia",
          name: "Onyxia",
          kind: "raid",
          minGroupSize: 10,
          maxGroupSize: 40,
          roleRequirements: [
            { role: "tank", count: 2 },
            { role: "healer", count: 8 },
            { role: "dps", count: 30 },
          ],
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects maxGroupSize > 40", () => {
    const bad = {
      enabled: true,
      content: [
        {
          id: "a",
          name: "A",
          kind: "raid",
          minGroupSize: 10,
          maxGroupSize: 999,
        },
      ],
    };
    expect(GroupFinderManifestSchema.safeParse(bad).success).toBe(false);
  });
});
