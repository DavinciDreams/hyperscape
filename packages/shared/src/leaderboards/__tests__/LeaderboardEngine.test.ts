import { LeaderboardsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  LeaderboardEngine,
  UnknownLeaderboardError,
  type LeaderboardScore,
} from "../LeaderboardEngine.js";

function manifest() {
  return LeaderboardsManifestSchema.parse([
    {
      id: "pvpRating",
      name: "PvP rating",
      metric: "pvpRating",
      sort: "desc",
      scope: "global",
      cadence: "season",
      tieBreak: "latestFirst",
      maxEntries: 100,
      rewardBrackets: [
        {
          id: "top1",
          label: "Rank 1",
          mode: "rank",
          minRank: 1,
          maxRank: 1,
          lootTableId: "rankOne",
          titleId: "pvpGod",
        },
        {
          id: "top10",
          label: "Top 10",
          mode: "rank",
          minRank: 2,
          maxRank: 10,
          lootTableId: "topTen",
        },
        {
          id: "top1p",
          label: "Top 1%",
          mode: "percent",
          minPercent: 0,
          maxPercent: 0.01,
          lootTableId: "topPercent",
        },
      ],
    },
    {
      id: "fastestDungeon",
      name: "Fastest dungeon",
      metric: "dungeonClearTime",
      sort: "asc",
      scope: "global",
      cadence: "weekly",
      tieBreak: "earliestFirst",
      maxEntries: 50,
      minLevel: 10,
      maxLevel: 60,
    },
  ]);
}

describe("LeaderboardEngine — lookup", () => {
  it("indexes by id", () => {
    const e = new LeaderboardEngine(manifest());
    expect(e.size).toBe(2);
    expect(e.has("pvpRating")).toBe(true);
  });

  it("throws on miss", () => {
    const e = new LeaderboardEngine(manifest());
    expect(() => e.get("ghost")).toThrow(UnknownLeaderboardError);
  });
});

describe("LeaderboardEngine — eligibility", () => {
  it("honors level band", () => {
    const e = new LeaderboardEngine(manifest());
    expect(
      e.isEligible("fastestDungeon", {
        playerId: "p1",
        score: 120,
        timestampMs: 0,
        playerLevel: 5,
      }),
    ).toBe(false);
    expect(
      e.isEligible("fastestDungeon", {
        playerId: "p1",
        score: 120,
        timestampMs: 0,
        playerLevel: 30,
      }),
    ).toBe(true);
  });
});

describe("LeaderboardEngine — ranking", () => {
  const scores: LeaderboardScore[] = [
    { playerId: "alice", score: 2400, timestampMs: 100, playerLevel: 60 },
    { playerId: "bob", score: 2200, timestampMs: 200, playerLevel: 60 },
    { playerId: "carol", score: 2400, timestampMs: 300, playerLevel: 60 },
    { playerId: "dave", score: 2000, timestampMs: 400, playerLevel: 60 },
  ];

  it("desc sort + latestFirst tie-break", () => {
    const e = new LeaderboardEngine(manifest());
    const ranked = e.rank("pvpRating", scores);
    // alice(2400, 100) vs carol(2400, 300) with latestFirst → carol first
    expect(ranked[0].playerId).toBe("carol");
    // Alice and Carol differ in timestamp → no tie; alice rank 2
    expect(ranked[1].playerId).toBe("alice");
    expect(ranked[1].rank).toBe(2);
  });

  it("asc sort for speedruns", () => {
    const e = new LeaderboardEngine(manifest());
    const times: LeaderboardScore[] = [
      { playerId: "a", score: 120, timestampMs: 1, playerLevel: 30 },
      { playerId: "b", score: 90, timestampMs: 2, playerLevel: 30 },
      { playerId: "c", score: 150, timestampMs: 3, playerLevel: 30 },
    ];
    const ranked = e.rank("fastestDungeon", times);
    expect(ranked.map((r) => r.playerId)).toEqual(["b", "a", "c"]);
  });

  it("maxEntries trims output", () => {
    const m = LeaderboardsManifestSchema.parse([
      {
        id: "small",
        name: "Small",
        metric: "xpEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "none",
        maxEntries: 10,
      },
    ]);
    const e = new LeaderboardEngine(m);
    const scores: LeaderboardScore[] = Array.from({ length: 20 }, (_, i) => ({
      playerId: `p${i}`,
      score: 100 - i,
      timestampMs: i,
      playerLevel: 50,
    }));
    const ranked = e.rank("small", scores);
    expect(ranked.length).toBe(10);
  });

  it("ties share rank with `none` tie-break", () => {
    const m = LeaderboardsManifestSchema.parse([
      {
        id: "tie",
        name: "tie",
        metric: "xpEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "none",
      },
    ]);
    const e = new LeaderboardEngine(m);
    const scores: LeaderboardScore[] = [
      { playerId: "a", score: 100, timestampMs: 1, playerLevel: 50 },
      { playerId: "b", score: 100, timestampMs: 2, playerLevel: 50 },
      { playerId: "c", score: 80, timestampMs: 3, playerLevel: 50 },
    ];
    const ranked = e.rank("tie", scores);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
  });

  it("drops players below minQualifyingScore", () => {
    const m = LeaderboardsManifestSchema.parse([
      {
        id: "qualify",
        name: "qualify",
        metric: "xpEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "none",
        minQualifyingScore: 500,
      },
    ]);
    const e = new LeaderboardEngine(m);
    const ranked = e.rank("qualify", [
      { playerId: "a", score: 1000, timestampMs: 1, playerLevel: 50 },
      { playerId: "b", score: 100, timestampMs: 2, playerLevel: 50 },
    ]);
    expect(ranked.length).toBe(1);
    expect(ranked[0].playerId).toBe("a");
  });
});

describe("LeaderboardEngine — reward brackets", () => {
  it("rank 1 resolves top1 bracket", () => {
    const e = new LeaderboardEngine(manifest());
    const b = e.bracketForRank("pvpRating", 1, 100);
    expect(b?.id).toBe("top1");
  });

  it("rank in top10 range", () => {
    const e = new LeaderboardEngine(manifest());
    const b = e.bracketForRank("pvpRating", 5, 100);
    expect(b?.id).toBe("top10");
  });

  it("returns null for out-of-range rank", () => {
    const e = new LeaderboardEngine(manifest());
    const b = e.bracketForRank("pvpRating", 50, 100);
    // top1p percent range is [0..0.01], percent at rank 50 = 49/100 = 0.49 → out
    expect(b).toBeNull();
  });

  it("percent bracket matches top 1%", () => {
    const m = LeaderboardsManifestSchema.parse([
      {
        id: "pctOnly",
        name: "pct",
        metric: "xpEarned",
        sort: "desc",
        scope: "global",
        cadence: "allTime",
        tieBreak: "none",
        rewardBrackets: [
          {
            id: "top1p",
            label: "Top 1%",
            mode: "percent",
            minPercent: 0,
            maxPercent: 0.01,
            lootTableId: "topPercent",
          },
        ],
      },
    ]);
    const e = new LeaderboardEngine(m);
    // rank 1 of 100 → percent = 0 → matches
    expect(e.bracketForRank("pctOnly", 1, 100)?.id).toBe("top1p");
    // rank 2 of 100 → percent = 0.01 → still matches (inclusive)
    expect(e.bracketForRank("pctOnly", 2, 100)?.id).toBe("top1p");
    // rank 3 of 100 → percent = 0.02 → out
    expect(e.bracketForRank("pctOnly", 3, 100)).toBeNull();
  });
});
