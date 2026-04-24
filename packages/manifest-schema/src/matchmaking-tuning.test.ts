import { describe, expect, it } from "vitest";
import {
  BackfillRulesSchema,
  MatchmakingQueueSchema,
  MatchmakingTuningManifestSchema,
  PartyConstraintsSchema,
} from "./matchmaking-tuning.js";

describe("PartyConstraintsSchema", () => {
  it("accepts defaults", () => {
    const p = PartyConstraintsSchema.parse({});
    expect(p.minPartySize).toBe(1);
    expect(p.maxPartySize).toBe(5);
  });

  it("rejects maxPartySize < minPartySize", () => {
    expect(() =>
      PartyConstraintsSchema.parse({ minPartySize: 5, maxPartySize: 3 }),
    ).toThrow(/maxPartySize/);
  });

  it("accepts max == min", () => {
    const p = PartyConstraintsSchema.parse({
      minPartySize: 5,
      maxPartySize: 5,
    });
    expect(p.maxPartySize).toBe(5);
  });
});

describe("BackfillRulesSchema", () => {
  it("accepts defaults", () => {
    const b = BackfillRulesSchema.parse({});
    expect(b.enabled).toBe(false);
    expect(b.offerRewardMultiplier).toBe(1);
  });
});

describe("MatchmakingQueueSchema", () => {
  const base = { id: "ranked", labelLocalizationKey: "q.ranked" };

  it("accepts minimal queue", () => {
    const q = MatchmakingQueueSchema.parse(base);
    expect(q.playersPerSide).toBe(5);
    expect(q.skillModel).toBe("elo");
  });

  it("rejects non-monotonic wideningSchedule", () => {
    expect(() =>
      MatchmakingQueueSchema.parse({
        ...base,
        wideningSchedule: [
          { afterSec: 30, ratingHalfWidth: 150 },
          { afterSec: 30, ratingHalfWidth: 200 },
        ],
      }),
    ).toThrow(/strictly increasing/);
  });

  it("accepts monotonic widening", () => {
    const q = MatchmakingQueueSchema.parse({
      ...base,
      wideningSchedule: [
        { afterSec: 30, ratingHalfWidth: 150 },
        { afterSec: 60, ratingHalfWidth: 250 },
        { afterSec: 120, ratingHalfWidth: 400 },
      ],
      hardTimeoutSec: 300,
    });
    expect(q.wideningSchedule).toHaveLength(3);
  });

  it("rejects widening step after hardTimeoutSec", () => {
    expect(() =>
      MatchmakingQueueSchema.parse({
        ...base,
        wideningSchedule: [{ afterSec: 400, ratingHalfWidth: 150 }],
        hardTimeoutSec: 300,
      }),
    ).toThrow(/hardTimeoutSec/);
  });

  it("accepts hardTimeoutSec=0 with widening steps", () => {
    const q = MatchmakingQueueSchema.parse({
      ...base,
      wideningSchedule: [{ afterSec: 3600, ratingHalfWidth: 100 }],
      hardTimeoutSec: 0,
    });
    expect(q.hardTimeoutSec).toBe(0);
  });
});

describe("MatchmakingTuningManifestSchema", () => {
  const queue = { id: "ranked", labelLocalizationKey: "q.ranked" };

  it("accepts disabled empty manifest", () => {
    const m = MatchmakingTuningManifestSchema.parse({ enabled: false });
    expect(m.queues).toEqual([]);
  });

  it("requires ≥1 queue when enabled", () => {
    expect(() =>
      MatchmakingTuningManifestSchema.parse({ enabled: true }),
    ).toThrow(/at least one queue/);
  });

  it("rejects duplicate queue ids", () => {
    expect(() =>
      MatchmakingTuningManifestSchema.parse({ queues: [queue, queue] }),
    ).toThrow(/unique/);
  });

  it("accepts valid manifest", () => {
    const m = MatchmakingTuningManifestSchema.parse({
      queues: [queue],
    });
    expect(m.queues).toHaveLength(1);
  });
});
