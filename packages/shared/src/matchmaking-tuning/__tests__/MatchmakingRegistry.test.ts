import { MatchmakingTuningManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  MatchmakingRegistry,
  UnknownQueueError,
} from "../MatchmakingRegistry.js";

function manifest() {
  return MatchmakingTuningManifestSchema.parse({
    enabled: true,
    queues: [
      {
        id: "ranked5v5",
        labelLocalizationKey: "queue.ranked5v5",
        playersPerSide: 5,
        numberOfSides: 2,
        skillModel: "elo",
        initialRatingHalfWidth: 50,
        wideningSchedule: [
          { afterSec: 30, ratingHalfWidth: 100 },
          {
            afterSec: 60,
            ratingHalfWidth: 200,
            allowCrossRegion: true,
            maxPingMs: 120,
          },
          {
            afterSec: 120,
            ratingHalfWidth: 400,
            allowCrossRegion: true,
            maxPingMs: 200,
          },
        ],
        party: {
          minPartySize: 1,
          maxPartySize: 5,
          allowSoloWithParty: false,
          maxPartyRatingSpread: 300,
        },
        backfill: {
          enabled: true,
          maxGameProgressSec: 90,
          backfillRatingHalfWidth: 150,
          offerRewardMultiplier: 1.25,
        },
        hardTimeoutSec: 300,
        priority: 100,
      },
      {
        id: "casual2v2",
        labelLocalizationKey: "queue.casual2v2",
        playersPerSide: 2,
        numberOfSides: 2,
        skillModel: "none",
        initialRatingHalfWidth: 0,
        wideningSchedule: [],
        party: {
          minPartySize: 1,
          maxPartySize: 2,
          allowSoloWithParty: true,
        },
        hardTimeoutSec: 0,
        priority: 50,
      },
    ],
    maxConcurrentQueues: 2,
    dodgePenaltySec: 120,
  });
}

describe("MatchmakingRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new MatchmakingRegistry(manifest());
    expect(r.size).toBe(2);
    expect(r.has("ranked5v5")).toBe(true);
    expect(r.has("ghost")).toBe(false);
  });

  it("throws on miss", () => {
    const r = new MatchmakingRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownQueueError);
  });

  it("sorts queues by priority descending", () => {
    const r = new MatchmakingRegistry(manifest());
    expect(r.queuesByPriority().map((q) => q.id)).toEqual([
      "ranked5v5",
      "casual2v2",
    ]);
  });
});

describe("MatchmakingRegistry — effectiveWindow", () => {
  it("returns initial when no step fires", () => {
    const r = new MatchmakingRegistry(manifest());
    const w = r.effectiveWindow("ranked5v5", 0);
    expect(w.ratingHalfWidth).toBe(50);
    expect(w.allowCrossRegion).toBe(false);
    expect(w.maxPingMs).toBe(0);
    expect(w.appliedStep).toBeNull();
  });

  it("picks latest applicable step", () => {
    const r = new MatchmakingRegistry(manifest());
    const at45 = r.effectiveWindow("ranked5v5", 45);
    expect(at45.ratingHalfWidth).toBe(100);
    expect(at45.appliedStep?.afterSec).toBe(30);

    const at90 = r.effectiveWindow("ranked5v5", 90);
    expect(at90.ratingHalfWidth).toBe(200);
    expect(at90.allowCrossRegion).toBe(true);
    expect(at90.maxPingMs).toBe(120);
    expect(at90.appliedStep?.afterSec).toBe(60);

    const at500 = r.effectiveWindow("ranked5v5", 500);
    expect(at500.ratingHalfWidth).toBe(400);
    expect(at500.appliedStep?.afterSec).toBe(120);
  });

  it("returns initial for queue with no widening schedule", () => {
    const r = new MatchmakingRegistry(manifest());
    const w = r.effectiveWindow("casual2v2", 9999);
    expect(w.ratingHalfWidth).toBe(0);
    expect(w.appliedStep).toBeNull();
  });
});

describe("MatchmakingRegistry — isExpired", () => {
  it("expires at hardTimeoutSec", () => {
    const r = new MatchmakingRegistry(manifest());
    expect(r.isExpired("ranked5v5", 299)).toBe(false);
    expect(r.isExpired("ranked5v5", 300)).toBe(true);
    expect(r.isExpired("ranked5v5", 301)).toBe(true);
  });

  it("never expires when hardTimeoutSec is 0", () => {
    const r = new MatchmakingRegistry(manifest());
    expect(r.isExpired("casual2v2", 10_000)).toBe(false);
  });
});

describe("MatchmakingRegistry — checkParty", () => {
  it("allows in-bounds party", () => {
    const r = new MatchmakingRegistry(manifest());
    const out = r.checkParty("ranked5v5", {
      partySize: 3,
      maxRating: 1500,
      minRating: 1400,
      includesSolo: false,
    });
    expect(out.allowed).toBe(true);
    expect(out.reason).toBe("allowed");
  });

  it("rejects too-small party", () => {
    const r = new MatchmakingRegistry(manifest());
    const out = r.checkParty("ranked5v5", {
      partySize: 0,
      maxRating: 1500,
      minRating: 1400,
      includesSolo: false,
    });
    expect(out.reason).toBe("too-small");
  });

  it("rejects too-large party", () => {
    const r = new MatchmakingRegistry(manifest());
    const out = r.checkParty("ranked5v5", {
      partySize: 6,
      maxRating: 1500,
      minRating: 1400,
      includesSolo: false,
    });
    expect(out.reason).toBe("too-large");
  });

  it("rejects solo-with-party when forbidden", () => {
    const r = new MatchmakingRegistry(manifest());
    const out = r.checkParty("ranked5v5", {
      partySize: 3,
      maxRating: 1500,
      minRating: 1400,
      includesSolo: true,
    });
    expect(out.reason).toBe("solo-with-party-forbidden");
  });

  it("rejects rating spread too wide", () => {
    const r = new MatchmakingRegistry(manifest());
    const out = r.checkParty("ranked5v5", {
      partySize: 3,
      maxRating: 2000,
      minRating: 1000,
      includesSolo: false,
    });
    expect(out.reason).toBe("rating-spread-too-wide");
  });

  it("ignores spread when maxPartyRatingSpread=0", () => {
    const r = new MatchmakingRegistry(manifest());
    const out = r.checkParty("casual2v2", {
      partySize: 2,
      maxRating: 9999,
      minRating: 0,
      includesSolo: false,
    });
    expect(out.allowed).toBe(true);
  });
});

describe("MatchmakingRegistry — canBackfill", () => {
  it("rejects when disabled", () => {
    const r = new MatchmakingRegistry(manifest());
    expect(r.canBackfill("casual2v2", 30, 1500, 1500)).toBe(false);
  });

  it("rejects when game too far along", () => {
    const r = new MatchmakingRegistry(manifest());
    expect(r.canBackfill("ranked5v5", 91, 1500, 1500)).toBe(false);
  });

  it("rejects when rating too far from average", () => {
    const r = new MatchmakingRegistry(manifest());
    expect(r.canBackfill("ranked5v5", 30, 1800, 1500)).toBe(false);
  });

  it("allows within windows", () => {
    const r = new MatchmakingRegistry(manifest());
    expect(r.canBackfill("ranked5v5", 30, 1500, 1500)).toBe(true);
    expect(r.canBackfill("ranked5v5", 30, 1650, 1500)).toBe(true);
  });
});

describe("MatchmakingRegistry — playersNeededPerMatch", () => {
  it("multiplies sides × perSide", () => {
    const r = new MatchmakingRegistry(manifest());
    expect(r.playersNeededPerMatch("ranked5v5")).toBe(10);
    expect(r.playersNeededPerMatch("casual2v2")).toBe(4);
  });
});
