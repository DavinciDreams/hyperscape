/**
 * Hot-reload tests for `npc-sizes`.
 *
 * Verifies that `hotReloadNPCSizes(manifest)` swaps NPC footprint
 * data in place while preserving the top-level `NPC_SIZES`
 * reference — the invariant that lets `RangeSystem`,
 * `LargeNPCSupport`, and other combat callers keep reading
 * `NPC_SIZES[id]` without re-importing after a PIE hot-reload.
 */

import { describe, expect, it, afterAll } from "vitest";

import type { NPCSizesManifest } from "@hyperforge/manifest-schema";

import { NPC_SIZES, hotReloadNPCSizes } from "../npc-sizes.js";

// Snapshot the module's initial state so tests can restore it
// afterwards — otherwise the mutations here would leak into other
// tests that rely on the bundled `npc-sizes.json` bosses.
const INITIAL_SNAPSHOT: NPCSizesManifest = {
  $schema: "hyperforge.npc-sizes.v1",
  sizes: Object.fromEntries(
    Object.entries(NPC_SIZES).map(([id, size]) => [id, { ...size }]),
  ),
};

afterAll(() => {
  hotReloadNPCSizes(INITIAL_SNAPSHOT);
});

describe("npc-sizes hot-reload", () => {
  it("preserves the top-level NPC_SIZES reference across reloads", () => {
    const refBefore = NPC_SIZES;
    hotReloadNPCSizes({
      $schema: "hyperforge.npc-sizes.v1",
      sizes: {
        "custom-boss": { width: 3, depth: 3 },
      },
    });
    const refAfter = NPC_SIZES;
    // Same object identity — callers that imported the binding once
    // at module-load time still see the new data.
    expect(refAfter).toBe(refBefore);
  });

  it("hot-reload replaces the prior size set — keys not in the new manifest vanish", () => {
    hotReloadNPCSizes({
      $schema: "hyperforge.npc-sizes.v1",
      sizes: {
        goblin: { width: 1, depth: 1 },
        giant_mole: { width: 3, depth: 3 },
      },
    });
    expect(NPC_SIZES["goblin"]).toEqual({ width: 1, depth: 1 });
    expect(NPC_SIZES["giant_mole"]).toEqual({ width: 3, depth: 3 });

    // Second reload drops giant_mole; the stale key must NOT linger.
    hotReloadNPCSizes({
      $schema: "hyperforge.npc-sizes.v1",
      sizes: {
        goblin: { width: 1, depth: 1 },
      },
    });
    expect(NPC_SIZES["goblin"]).toEqual({ width: 1, depth: 1 });
    expect(NPC_SIZES["giant_mole"]).toBeUndefined();
  });

  it("hot-reload overwrites same-id footprints", () => {
    hotReloadNPCSizes({
      $schema: "hyperforge.npc-sizes.v1",
      sizes: {
        dragon: { width: 2, depth: 2 },
      },
    });
    expect(NPC_SIZES["dragon"]).toEqual({ width: 2, depth: 2 });

    hotReloadNPCSizes({
      $schema: "hyperforge.npc-sizes.v1",
      sizes: {
        dragon: { width: 5, depth: 5 },
      },
    });
    expect(NPC_SIZES["dragon"]).toEqual({ width: 5, depth: 5 });
  });

  it("malformed manifest throws without mutating NPC_SIZES", () => {
    hotReloadNPCSizes({
      $schema: "hyperforge.npc-sizes.v1",
      sizes: {
        baseline: { width: 1, depth: 1 },
      },
    });
    const snapshot = { ...NPC_SIZES["baseline"] };

    // `width` must be a positive integer — string should trip zod.
    expect(() =>
      hotReloadNPCSizes({
        $schema: "hyperforge.npc-sizes.v1",
        sizes: {
          bad: { width: "oops" as unknown as number, depth: 1 },
        },
      }),
    ).toThrow();

    // Prior state preserved.
    expect(NPC_SIZES["baseline"]).toEqual(snapshot);
    expect(NPC_SIZES["bad"]).toBeUndefined();
  });
});
