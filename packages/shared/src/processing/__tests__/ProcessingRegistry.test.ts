import { ProcessingManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  ProcessingNotLoadedError,
  ProcessingRegistry,
} from "../ProcessingRegistry.js";

function manifest() {
  return ProcessingManifestSchema.parse({
    $schema: "hyperforge.processing.v1",
    skillMechanics: {
      firemaking: {
        type: "fixed-roll-retry-on-fail",
        baseRollTicks: 4,
        retryOnFail: true,
        levelAffectsSuccess: true,
      },
      cooking: {
        type: "fixed-tick-continuous",
        ticksPerItem: 3,
        levelAffectsBurn: true,
        levelAffectsSpeed: false,
      },
    },
    firemakingSuccessRate: { low: 64, high: 192 },
    fire: {
      minDurationTicks: 60,
      maxDurationTicks: 120,
      maxFiresPerPlayer: 3,
      maxFiresPerArea: 10,
      interactionRange: 1.5,
    },
    fireWalkPriority: ["west", "east", "south", "north"],
    timing: { rateLimitMs: 200, minimumCycleTicks: 4 },
  });
}

describe("ProcessingRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new ProcessingRegistry().manifest).toThrow(
      ProcessingNotLoadedError,
    );
  });

  it("exposes mechanics + fire + timing", () => {
    const r = new ProcessingRegistry(manifest());
    expect(r.firemaking.baseRollTicks).toBe(4);
    expect(r.cooking.ticksPerItem).toBe(3);
    expect(r.firemakingSuccessRate.high).toBe(192);
    expect(r.fire.minDurationTicks).toBe(60);
    expect(r.rateLimitMs).toBe(200);
    expect(r.minimumCycleTicks).toBe(4);
  });

  it("fireWalkPriority is the 4-direction sequence", () => {
    const r = new ProcessingRegistry(manifest());
    expect(r.fireWalkPriority).toEqual(["west", "east", "south", "north"]);
  });
});
