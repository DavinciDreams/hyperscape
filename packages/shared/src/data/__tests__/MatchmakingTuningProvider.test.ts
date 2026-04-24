/**
 * Tests for the MatchmakingTuningProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { matchmakingTuningProvider } from "../MatchmakingTuningProvider";

beforeEach(() => {
  matchmakingTuningProvider.unload();
});
afterEach(() => {
  matchmakingTuningProvider.unload();
});

const disabledBaseline = {
  enabled: false,
};

describe("MatchmakingTuningProvider", () => {
  it("starts unloaded", () => {
    expect(matchmakingTuningProvider.isLoaded()).toBe(false);
    expect(matchmakingTuningProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts disabled baseline — refinement dormant when enabled=false", () => {
    const parsed = matchmakingTuningProvider.loadRaw(disabledBaseline);
    expect(parsed.enabled).toBe(false);
    expect(parsed.queues).toEqual([]);
  });

  it("loadRaw() rejects enabled=true with no queues", () => {
    expect(() =>
      matchmakingTuningProvider.loadRaw({ enabled: true, queues: [] }),
    ).toThrow();
  });

  it("loadRaw() accepts enabled=true with valid queues", () => {
    const parsed = matchmakingTuningProvider.loadRaw({
      enabled: true,
      queues: [
        {
          id: "pvpArena",
          labelLocalizationKey: "queue.pvpArena",
          playersPerSide: 5,
          numberOfSides: 2,
        },
      ],
    });
    expect(parsed.queues.length).toBe(1);
    expect(parsed.queues[0].id).toBe("pvpArena");
  });

  it("loadRaw() rejects duplicate queue ids", () => {
    expect(() =>
      matchmakingTuningProvider.loadRaw({
        enabled: true,
        queues: [
          { id: "dup", labelLocalizationKey: "a" },
          { id: "dup", labelLocalizationKey: "b" },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects non-monotonic wideningSchedule afterSec", () => {
    expect(() =>
      matchmakingTuningProvider.loadRaw({
        enabled: true,
        queues: [
          {
            id: "q1",
            labelLocalizationKey: "q1",
            wideningSchedule: [
              { afterSec: 30, ratingHalfWidth: 200 },
              { afterSec: 20, ratingHalfWidth: 400 },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = matchmakingTuningProvider.loadRaw(disabledBaseline);
    matchmakingTuningProvider.unload();
    matchmakingTuningProvider.load(parsed);
    expect(matchmakingTuningProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    matchmakingTuningProvider.loadRaw(disabledBaseline);
    matchmakingTuningProvider.hotReload(null);
    expect(matchmakingTuningProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(matchmakingTuningProvider).toBe(matchmakingTuningProvider);
  });
});
