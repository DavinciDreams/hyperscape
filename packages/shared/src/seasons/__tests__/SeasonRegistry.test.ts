import { SeasonsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  SeasonRegistry,
  UnknownSeasonError,
  UnknownTrackError,
} from "../SeasonRegistry.js";

function manifest() {
  return SeasonsManifestSchema.parse([
    {
      id: "season1",
      name: "Rising Storm",
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: "2026-04-01T00:00:00Z",
      premiumPassPrice: 1000,
      tracks: [
        {
          id: "free",
          name: "Free",
          kind: "free",
          tiers: [
            {
              tier: 1,
              xpRequired: 100,
              rewardItemId: "xpBoost",
              rewardCount: 1,
            },
            {
              tier: 2,
              xpRequired: 200,
              rewardItemId: "xpBoost",
              rewardCount: 2,
            },
            {
              tier: 3,
              xpRequired: 300,
              rewardItemId: "xpBoost",
              rewardCount: 3,
            },
          ],
        },
        {
          id: "premium",
          name: "Premium",
          kind: "premium",
          tiers: [
            { tier: 1, xpRequired: 100, rewardItemId: "glyph", rewardCount: 1 },
            { tier: 2, xpRequired: 200, rewardItemId: "glyph", rewardCount: 2 },
          ],
        },
      ],
      challenges: [
        {
          id: "daily1",
          name: "Daily 1",
          frequency: "daily",
          questId: "q1",
          xpReward: 50,
        },
        {
          id: "weekly1",
          name: "Weekly 1",
          frequency: "weekly",
          questId: "q2",
          xpReward: 200,
          unlockWeek: 2,
        },
      ],
      endBehavior: {
        mailUnclaimedRewards: true,
        resetXp: true,
        gracePeriodDays: 7,
        snapshotLeaderboard: true,
      },
    },
    {
      id: "season2",
      name: "Summer Bloom",
      startsAt: "2026-05-01T00:00:00Z",
      endsAt: "2026-08-01T00:00:00Z",
      tracks: [
        {
          id: "free",
          name: "Free",
          kind: "free",
          tiers: [
            { tier: 1, xpRequired: 100, rewardItemId: "item", rewardCount: 1 },
          ],
        },
      ],
    },
  ]);
}

describe("SeasonRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new SeasonRegistry(manifest());
    expect(r.size).toBe(2);
    expect(r.has("season1")).toBe(true);
  });

  it("throws UnknownSeasonError on miss", () => {
    const r = new SeasonRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownSeasonError);
  });

  it("getTrack throws UnknownTrackError on miss", () => {
    const r = new SeasonRegistry(manifest());
    expect(() => r.getTrack("season1", "ghost")).toThrow(UnknownTrackError);
  });
});

describe("SeasonRegistry — active/upcoming", () => {
  it("activeSeason returns season when within window", () => {
    const r = new SeasonRegistry(manifest());
    const now = Date.parse("2026-02-15T00:00:00Z");
    expect(r.activeSeason(now)?.id).toBe("season1");
  });

  it("activeSeason returns null between seasons", () => {
    const r = new SeasonRegistry(manifest());
    const between = Date.parse("2026-04-15T00:00:00Z");
    expect(r.activeSeason(between)).toBeNull();
  });

  it("upcomingSeason returns next future season", () => {
    const r = new SeasonRegistry(manifest());
    const between = Date.parse("2026-04-15T00:00:00Z");
    expect(r.upcomingSeason(between)?.id).toBe("season2");
  });

  it("activeSeason returns null after all seasons end", () => {
    const r = new SeasonRegistry(manifest());
    const after = Date.parse("2027-01-01T00:00:00Z");
    expect(r.activeSeason(after)).toBeNull();
    expect(r.upcomingSeason(after)).toBeNull();
  });
});

describe("SeasonRegistry — tier progression", () => {
  it("no xp → tierIndex 0 with nextTier=tier1", () => {
    const r = new SeasonRegistry(manifest());
    const p = r.resolveTierProgress("season1", "free", 0);
    expect(p.tierIndex).toBe(0);
    expect(p.currentTier).toBeNull();
    expect(p.nextTier?.tier).toBe(1);
    expect(p.xpIntoNext).toBe(0);
    expect(p.xpForNext).toBe(100);
  });

  it("150 xp → on tier 1, 50 into tier 2", () => {
    const r = new SeasonRegistry(manifest());
    const p = r.resolveTierProgress("season1", "free", 150);
    expect(p.tierIndex).toBe(1);
    expect(p.currentTier?.tier).toBe(1);
    expect(p.nextTier?.tier).toBe(2);
    expect(p.xpIntoNext).toBe(50);
    expect(p.xpForNext).toBe(200);
  });

  it("full progression reaches cap", () => {
    const r = new SeasonRegistry(manifest());
    const p = r.resolveTierProgress("season1", "free", 600);
    expect(p.tierIndex).toBe(3);
    expect(p.currentTier?.tier).toBe(3);
    expect(p.nextTier).toBeNull();
  });

  it("rejects negative xp", () => {
    const r = new SeasonRegistry(manifest());
    expect(() => r.resolveTierProgress("season1", "free", -1)).toThrow(
      TypeError,
    );
  });
});

describe("SeasonRegistry — challenges", () => {
  it("filters by frequency", () => {
    const r = new SeasonRegistry(manifest());
    const daily = r.challengesOfFrequency("season1", "daily");
    const weekly = r.challengesOfFrequency("season1", "weekly");
    expect(daily.map((c) => c.id)).toEqual(["daily1"]);
    expect(weekly.map((c) => c.id)).toEqual(["weekly1"]);
  });
});

describe("SeasonRegistry — grace period", () => {
  it("false during active window", () => {
    const r = new SeasonRegistry(manifest());
    expect(
      r.isInGracePeriod("season1", Date.parse("2026-02-01T00:00:00Z")),
    ).toBe(false);
  });

  it("true within grace window", () => {
    const r = new SeasonRegistry(manifest());
    const end = Date.parse("2026-04-01T00:00:00Z");
    expect(r.isInGracePeriod("season1", end + 1_000)).toBe(true);
    expect(r.isInGracePeriod("season1", end + 6 * 24 * 60 * 60 * 1000)).toBe(
      true,
    );
  });

  it("false once grace window elapses", () => {
    const r = new SeasonRegistry(manifest());
    const end = Date.parse("2026-04-01T00:00:00Z");
    expect(r.isInGracePeriod("season1", end + 8 * 24 * 60 * 60 * 1000)).toBe(
      false,
    );
  });
});
