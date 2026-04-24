/**
 * Faithfulness test: a processing manifest built from the values currently
 * hardcoded in `packages/shared/src/constants/ProcessingConstants.ts` MUST
 * parse cleanly.
 */

import { describe, expect, it } from "vitest";

import {
  ProcessingManifestSchema,
  type ProcessingManifest,
} from "./processing.js";

const hyperscapeProcessingManifest: ProcessingManifest = {
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
      ticksPerItem: 4,
      levelAffectsBurn: true,
      levelAffectsSpeed: false,
    },
  },
  firemakingSuccessRate: {
    low: 65,
    high: 513,
  },
  fire: {
    minDurationTicks: 100,
    maxDurationTicks: 198,
    maxFiresPerPlayer: 3,
    maxFiresPerArea: 20,
    interactionRange: 1,
  },
  fireWalkPriority: ["west", "east", "south", "north"],
  timing: {
    rateLimitMs: 600,
    minimumCycleTicks: 2,
  },
};

describe("ProcessingManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = ProcessingManifestSchema.safeParse(
      hyperscapeProcessingManifest,
    );
    if (!result.success) {
      throw new Error(
        `Hyperscape processing manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects wrong schema version", () => {
    const wrong = {
      ...hyperscapeProcessingManifest,
      $schema: "hyperforge.processing.v0",
    };
    const result = ProcessingManifestSchema.safeParse(wrong);
    expect(result.success).toBe(false);
  });

  it("rejects fireWalkPriority with wrong length", () => {
    const bad = {
      ...hyperscapeProcessingManifest,
      fireWalkPriority: ["west", "east"],
    };
    const result = ProcessingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects unknown firemaking mechanic type", () => {
    const bad = {
      ...hyperscapeProcessingManifest,
      skillMechanics: {
        ...hyperscapeProcessingManifest.skillMechanics,
        firemaking: {
          ...hyperscapeProcessingManifest.skillMechanics.firemaking,
          type: "bogus-type",
        },
      },
    };
    const result = ProcessingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
