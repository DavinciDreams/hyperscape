import { ProcessingManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
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

describe("ProcessingRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new ProcessingRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new ProcessingRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new ProcessingRegistry();
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
