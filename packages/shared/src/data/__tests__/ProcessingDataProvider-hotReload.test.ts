/**
 * Tests for ProcessingDataProvider.hotReload — the entry point the editor's
 * PIE session uses to push recipe manifest edits into the running game
 * without a Stop → Play cycle (Phase B3).
 *
 * Covers cooking + firemaking as representative kinds; the per-skill load
 * helpers themselves are exercised by `packages/manifest-schema/src/recipes.test.ts`
 * and the provider's existing integration suites.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  ProcessingDataProvider,
  type CookingManifest,
  type FiremakingManifest,
} from "../ProcessingDataProvider";

function makeCooking(
  overrides: Partial<CookingManifest["recipes"][number]> = {},
): CookingManifest {
  return {
    recipes: [
      {
        raw: "raw_shrimp",
        cooked: "cooked_shrimp",
        burnt: "burnt_shrimp",
        level: 1,
        xp: 30,
        ticks: 3,
        stopBurnLevel: { fire: 34, range: 34 },
        ...overrides,
      },
    ],
  };
}

function makeFiremaking(): FiremakingManifest {
  return {
    recipes: [{ log: "logs", level: 1, xp: 40, ticks: 4 }],
  };
}

describe("ProcessingDataProvider.hotReload", () => {
  const provider = ProcessingDataProvider.getInstance();

  beforeEach(() => {
    provider.hotReload({
      cooking: makeCooking(),
      firemaking: makeFiremaking(),
    });
  });

  it("swaps cooking recipes and rebuilds derived maps", () => {
    const before = provider.getCookingData("raw_shrimp");
    expect(before?.levelRequired).toBe(1);

    provider.hotReload({
      cooking: makeCooking({ level: 15, xp: 99 }),
    });

    const after = provider.getCookingData("raw_shrimp");
    expect(after?.levelRequired).toBe(15);
    expect(after?.xp).toBe(99);
  });

  it("accepts partial updates — firemaking edits leave cooking intact", () => {
    expect(provider.getCookingData("raw_shrimp")?.levelRequired).toBe(1);
    expect(provider.getFiremakingData("logs")?.xp).toBe(40);

    provider.hotReload({
      firemaking: { recipes: [{ log: "logs", level: 1, xp: 60, ticks: 4 }] },
    });

    // Firemaking picked up the edit.
    expect(provider.getFiremakingData("logs")?.xp).toBe(60);
    // Cooking is unchanged.
    expect(provider.getCookingData("raw_shrimp")?.levelRequired).toBe(1);
  });

  it("rejects malformed manifests and leaves prior state intact", () => {
    const before = provider.getCookingData("raw_shrimp");
    expect(before?.levelRequired).toBe(1);

    expect(() =>
      provider.hotReload({
        // `raw` is required by schema; empty string violates z.string().min(1)
        // @ts-expect-error — deliberately malformed to exercise validation
        cooking: { recipes: [{ ...makeCooking().recipes[0], raw: "" }] },
      }),
    ).toThrow();

    // Prior state is still readable.
    const after = provider.getCookingData("raw_shrimp");
    expect(after?.levelRequired).toBe(1);
  });
});
