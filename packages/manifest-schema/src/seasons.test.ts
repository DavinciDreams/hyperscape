/**
 * Faithfulness + defensiveness tests for `SeasonsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { SeasonsManifestSchema, type SeasonsManifest } from "./seasons.js";

const reference: SeasonsManifest = [
  {
    id: "season1Reckoning",
    name: "Season 1: Reckoning",
    description: "The first season of Hyperia live-ops.",
    iconId: "iconSeason1",
    startsAt: "2026-05-01T00:00:00Z",
    endsAt: "2026-07-31T23:59:59Z",
    tracks: [
      {
        id: "freeTrack",
        name: "Free Track",
        kind: "free",
        tiers: [
          {
            tier: 1,
            xpRequired: 1000,
            rewardItemId: "reckoningPin",
            rewardCount: 1,
            rewardCurrencyAmount: 0,
            rewardCurrencyId: "gold",
            label: "",
          },
          {
            tier: 5,
            xpRequired: 5000,
            rewardItemId: "",
            rewardCount: 0,
            rewardCurrencyAmount: 5000,
            rewardCurrencyId: "gold",
            label: "",
          },
          {
            tier: 10,
            xpRequired: 10000,
            rewardItemId: "reckoningBanner",
            rewardCount: 1,
            rewardCurrencyAmount: 0,
            rewardCurrencyId: "gold",
            label: "RARE",
          },
        ],
      },
      {
        id: "premiumTrack",
        name: "Premium Track",
        kind: "premium",
        tiers: [
          {
            tier: 1,
            xpRequired: 1000,
            rewardItemId: "premiumPetEgg",
            rewardCount: 1,
            rewardCurrencyAmount: 0,
            rewardCurrencyId: "gold",
            label: "",
          },
          {
            tier: 10,
            xpRequired: 10000,
            rewardItemId: "premiumMount",
            rewardCount: 1,
            rewardCurrencyAmount: 0,
            rewardCurrencyId: "gold",
            label: "EPIC",
          },
        ],
      },
    ],
    challenges: [
      {
        id: "killGoblins",
        name: "Slay the Horde",
        description: "Kill 100 goblins.",
        frequency: "weekly",
        questId: "questKillGoblins",
        xpReward: 500,
        premiumOnly: false,
        unlockWeek: 1,
      },
      {
        id: "premiumBoss",
        name: "Fell the Dragon",
        description: "Defeat the seasonal boss.",
        frequency: "season",
        questId: "questDragonKill",
        xpReward: 2500,
        premiumOnly: true,
        unlockWeek: 0,
      },
    ],
    premiumPassPrice: 1000,
    premiumPassCurrencyId: "gold",
    endBehavior: {
      mailUnclaimedRewards: true,
      resetXp: true,
      gracePeriodDays: 7,
      snapshotLeaderboard: true,
    },
    themeColor: "#aa2233",
  },
  {
    id: "season2Ascension",
    name: "Season 2: Ascension",
    description: "The second season of Hyperia live-ops.",
    iconId: "iconSeason2",
    startsAt: "2026-08-01T00:00:00Z",
    endsAt: "2026-10-31T23:59:59Z",
    tracks: [
      {
        id: "freeTrack",
        name: "Free Track",
        kind: "free",
        tiers: [
          {
            tier: 1,
            xpRequired: 1000,
            rewardItemId: "ascensionPin",
            rewardCount: 1,
            rewardCurrencyAmount: 0,
            rewardCurrencyId: "gold",
            label: "",
          },
        ],
      },
    ],
    challenges: [],
    premiumPassPrice: 0,
    premiumPassCurrencyId: "gold",
    endBehavior: {
      mailUnclaimedRewards: true,
      resetXp: true,
      gracePeriodDays: 7,
      snapshotLeaderboard: true,
    },
    themeColor: "",
  },
];

describe("SeasonsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = SeasonsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("parses an empty manifest", () => {
    expect(SeasonsManifestSchema.safeParse([]).success).toBe(true);
  });

  it("applies defaults on minimal season", () => {
    const minimal = [
      {
        id: "tinySeason",
        name: "Tiny",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
    ];
    const result = SeasonsManifestSchema.safeParse(minimal);
    if (!result.success) {
      throw new Error(
        `Minimal season failed:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    const season = result.data[0];
    expect(season.description).toBe("");
    expect(season.iconId).toBe("");
    expect(season.challenges).toEqual([]);
    expect(season.premiumPassPrice).toBe(0);
    expect(season.premiumPassCurrencyId).toBe("gold");
    expect(season.endBehavior.mailUnclaimedRewards).toBe(true);
    expect(season.endBehavior.resetXp).toBe(true);
    expect(season.endBehavior.gracePeriodDays).toBe(7);
    expect(season.endBehavior.snapshotLeaderboard).toBe(true);
    expect(season.themeColor).toBe("");
    const tier = season.tracks[0].tiers[0];
    expect(tier.rewardItemId).toBe("placeholder");
    expect(tier.rewardCount).toBe(1);
    expect(tier.rewardCurrencyAmount).toBe(0);
    expect(tier.rewardCurrencyId).toBe("gold");
    expect(tier.label).toBe("");
  });

  it("rejects duplicate season ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
      {
        id: "dup",
        name: "B",
        startsAt: "2026-03-01T00:00:00Z",
        endsAt: "2026-04-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects overlapping season time windows", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-15T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
      {
        id: "b",
        name: "B",
        startsAt: "2026-02-01T00:00:00Z",
        endsAt: "2026-03-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts adjacent (non-overlapping) season windows", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
      {
        id: "b",
        name: "B",
        startsAt: "2026-02-01T00:00:00Z",
        endsAt: "2026-03-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects startsAt >= endsAt", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-02-01T00:00:00Z",
        endsAt: "2026-01-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects season with no free track", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "prem",
            name: "Prem",
            kind: "premium",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects season with duplicate track ids", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free A",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
          {
            id: "free",
            name: "Free B",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects season with duplicate challenge ids", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
        challenges: [
          {
            id: "dup",
            name: "A",
            frequency: "weekly",
            questId: "q1",
            xpReward: 100,
          },
          {
            id: "dup",
            name: "B",
            frequency: "weekly",
            questId: "q2",
            xpReward: 100,
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-monotonic tier numbers on a track", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [
              { tier: 1, xpRequired: 1000 },
              { tier: 3, xpRequired: 3000 },
              { tier: 2, xpRequired: 2000 },
            ],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate tier numbers on a track", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [
              { tier: 1, xpRequired: 1000 },
              { tier: 1, xpRequired: 2000 },
            ],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects tier with rewardCount > 0 but no item and no currency", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [
              {
                tier: 1,
                xpRequired: 1000,
                rewardItemId: "",
                rewardCount: 1,
                rewardCurrencyAmount: 0,
              },
            ],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts tier with rewardCount = 0 (cosmetic-only)", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [
              {
                tier: 1,
                xpRequired: 1000,
                rewardItemId: "",
                rewardCount: 0,
                rewardCurrencyAmount: 0,
                label: "Cosmetic Milestone",
              },
            ],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects premiumPassPrice > 0 without premium track", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
        premiumPassPrice: 500,
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts premiumPassPrice = 0 without premium track", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
        premiumPassPrice: 0,
      },
    ];
    expect(SeasonsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects invalid ISO 8601 startsAt", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "May 1 2026",
        endsAt: "2026-06-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown track kind", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "platinum",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown challenge frequency", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
        challenges: [
          {
            id: "c",
            name: "C",
            frequency: "monthly",
            questId: "q",
            xpReward: 100,
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects track with empty tiers", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects season with empty tracks", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid themeColor format", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
        themeColor: "red",
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects tier number > 200", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 500, xpRequired: 1000 }],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid season id format", () => {
    const bad = [
      {
        id: "Not Valid",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
        extraField: "nope",
      },
    ];
    expect(SeasonsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts challenge with unlockWeek = 0 (season start)", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        tracks: [
          {
            id: "free",
            name: "Free",
            kind: "free",
            tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "placeholder" }],
          },
        ],
        challenges: [
          {
            id: "c",
            name: "C",
            frequency: "daily",
            questId: "q",
            xpReward: 100,
            unlockWeek: 0,
          },
        ],
      },
    ];
    expect(SeasonsManifestSchema.safeParse(ok).success).toBe(true);
  });
});
