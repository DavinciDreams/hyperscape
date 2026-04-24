/**
 * Faithfulness + defensiveness tests for `LeaderboardsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  LeaderboardsManifestSchema,
  type LeaderboardsManifest,
} from "./leaderboards.js";

const reference: LeaderboardsManifest = [
  {
    id: "globalPvpRating",
    name: "Global Arena Rating",
    description: "Top-ranked PvP duelists across all regions.",
    iconId: "iconArena",
    metric: "pvpRating",
    customMetricKey: "",
    sort: "desc",
    scope: "global",
    cadence: "season",
    tieBreak: "latestFirst",
    maxEntries: 10000,
    minQualifyingScore: 1500,
    minLevel: 30,
    maxLevel: 100,
    frozenBetweenRollups: false,
    announceTopOnRollover: true,
    announceTopN: 10,
    rewardBrackets: [
      {
        id: "top1",
        label: "Champion",
        mode: "rank",
        minRank: 1,
        maxRank: 1,
        minPercent: 0,
        maxPercent: 0,
        lootTableId: "lootChampionChest",
        titleId: "titleChampion",
        currencyAmount: 100000,
        currencyId: "gold",
      },
      {
        id: "top10",
        label: "Top 10",
        mode: "rank",
        minRank: 2,
        maxRank: 10,
        minPercent: 0,
        maxPercent: 0,
        lootTableId: "lootTop10Chest",
        titleId: "titleGladiator",
        currencyAmount: 25000,
        currencyId: "gold",
      },
    ],
  },
  {
    id: "fastestDungeonClear",
    name: "Speed Dungeon",
    description: "Fastest dungeon clear times.",
    iconId: "iconStopwatch",
    metric: "dungeonClearTime",
    customMetricKey: "",
    sort: "asc",
    scope: "region",
    cadence: "weekly",
    tieBreak: "earliestFirst",
    maxEntries: 500,
    minQualifyingScore: 0,
    minLevel: 50,
    maxLevel: 100,
    frozenBetweenRollups: false,
    announceTopOnRollover: false,
    announceTopN: 10,
    rewardBrackets: [
      {
        id: "topPct",
        label: "Top 1%",
        mode: "percent",
        minRank: 1,
        maxRank: 1,
        minPercent: 0,
        maxPercent: 0.01,
        lootTableId: "lootSpeedrunner",
        titleId: "",
        currencyAmount: 5000,
        currencyId: "gold",
      },
    ],
  },
  {
    id: "customBoard",
    name: "Custom Metric Board",
    description: "A custom metric registered by a plugin.",
    iconId: "",
    metric: "custom",
    customMetricKey: "barrelsOfFishHooked",
    sort: "desc",
    scope: "faction",
    cadence: "monthly",
    tieBreak: "none",
    maxEntries: 100,
    minQualifyingScore: 0,
    minLevel: 1,
    maxLevel: 100,
    frozenBetweenRollups: false,
    announceTopOnRollover: false,
    announceTopN: 10,
    rewardBrackets: [],
  },
];

describe("LeaderboardsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = LeaderboardsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("parses an empty manifest", () => {
    expect(LeaderboardsManifestSchema.safeParse([]).success).toBe(true);
  });

  it("applies defaults on minimal leaderboard", () => {
    const minimal = [
      {
        id: "minimalBoard",
        name: "Minimal",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
      },
    ];
    const result = LeaderboardsManifestSchema.safeParse(minimal);
    if (!result.success) {
      throw new Error(
        `Minimal failed:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    const lb = result.data[0];
    expect(lb.description).toBe("");
    expect(lb.iconId).toBe("");
    expect(lb.customMetricKey).toBe("");
    expect(lb.maxEntries).toBe(1000);
    expect(lb.minQualifyingScore).toBe(0);
    expect(lb.minLevel).toBe(1);
    expect(lb.maxLevel).toBe(100);
    expect(lb.frozenBetweenRollups).toBe(false);
    expect(lb.announceTopOnRollover).toBe(false);
    expect(lb.announceTopN).toBe(10);
    expect(lb.rewardBrackets).toEqual([]);
  });

  it("rejects duplicate leaderboard ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
      },
      {
        id: "dup",
        name: "B",
        metric: "xpEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects minLevel > maxLevel", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        minLevel: 80,
        maxLevel: 30,
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects custom metric without customMetricKey (iff violation)", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "custom",
        customMetricKey: "",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-custom metric with customMetricKey set (iff violation)", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        customMetricKey: "stray",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate bracket ids within a leaderboard", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        rewardBrackets: [
          {
            id: "dup",
            label: "First",
            mode: "rank",
            minRank: 1,
            maxRank: 1,
            lootTableId: "lootA",
          },
          {
            id: "dup",
            label: "Second",
            mode: "rank",
            minRank: 2,
            maxRank: 2,
            lootTableId: "lootB",
          },
        ],
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects overlapping rank brackets", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        rewardBrackets: [
          {
            id: "top5",
            label: "Top 5",
            mode: "rank",
            minRank: 1,
            maxRank: 5,
            lootTableId: "lootA",
          },
          {
            id: "top3",
            label: "Top 3",
            mode: "rank",
            minRank: 3,
            maxRank: 7,
            lootTableId: "lootB",
          },
        ],
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts adjacent non-overlapping rank brackets", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        rewardBrackets: [
          {
            id: "top1",
            label: "Top 1",
            mode: "rank",
            minRank: 1,
            maxRank: 1,
            lootTableId: "lootA",
          },
          {
            id: "top10",
            label: "Top 10",
            mode: "rank",
            minRank: 2,
            maxRank: 10,
            lootTableId: "lootB",
          },
        ],
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects overlapping percent brackets", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        rewardBrackets: [
          {
            id: "top1pct",
            label: "Top 1%",
            mode: "percent",
            minPercent: 0,
            maxPercent: 0.01,
            lootTableId: "lootA",
          },
          {
            id: "top5pct",
            label: "Top 5%",
            mode: "percent",
            minPercent: 0.005,
            maxPercent: 0.05,
            lootTableId: "lootB",
          },
        ],
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts rank and percent brackets on same leaderboard (different modes don't overlap)", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        rewardBrackets: [
          {
            id: "top1",
            label: "Top 1",
            mode: "rank",
            minRank: 1,
            maxRank: 1,
            lootTableId: "lootA",
          },
          {
            id: "top1pct",
            label: "Top 1%",
            mode: "percent",
            minPercent: 0,
            maxPercent: 0.01,
            lootTableId: "lootB",
          },
        ],
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects rank bracket with minRank > maxRank", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        rewardBrackets: [
          {
            id: "bad",
            label: "Bad",
            mode: "rank",
            minRank: 10,
            maxRank: 5,
            lootTableId: "loot",
          },
        ],
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects percent bracket with minPercent > maxPercent", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        rewardBrackets: [
          {
            id: "bad",
            label: "Bad",
            mode: "percent",
            minPercent: 0.5,
            maxPercent: 0.1,
            lootTableId: "loot",
          },
        ],
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxEntries < 10", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        maxEntries: 5,
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown metric kind", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "brainpower",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown scope", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "solarSystem",
        cadence: "allTime",
        tieBreak: "latestFirst",
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown cadence", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "hourly",
        tieBreak: "latestFirst",
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown tieBreak", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "randomize",
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid leaderboard id format", () => {
    const bad = [
      {
        id: "Not Valid",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        extraField: "nope",
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts announce opts with top N up to 100", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        announceTopOnRollover: true,
        announceTopN: 100,
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects announceTopN > 100", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        announceTopN: 500,
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts frozen-between-rollups flag", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "weekly",
        tieBreak: "latestFirst",
        frozenBetweenRollups: true,
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts non-default currencyId in bracket", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        metric: "goldEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "latestFirst",
        rewardBrackets: [
          {
            id: "top1",
            label: "Top 1",
            mode: "rank",
            minRank: 1,
            maxRank: 1,
            lootTableId: "loot",
            currencyAmount: 100,
            currencyId: "honorToken",
          },
        ],
      },
    ];
    expect(LeaderboardsManifestSchema.safeParse(ok).success).toBe(true);
  });
});
