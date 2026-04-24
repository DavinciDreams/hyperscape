/**
 * Faithfulness test: an interaction manifest built from the values currently
 * hardcoded in `packages/shared/src/constants/interaction.ts` MUST
 * parse cleanly.
 */

import { describe, expect, it } from "vitest";

import {
  InteractionManifestSchema,
  type InteractionManifest,
} from "./interaction.js";

const hyperscapeInteractionManifest: InteractionManifest = {
  $schema: "hyperforge.interaction.v1",
  sessionTypes: {
    store: "store",
    bank: "bank",
    dialogue: "dialogue",
  },
  interactionDistance: {
    store: 2,
    bank: 2,
    dialogue: 2,
  },
  transactionRateLimitMs: 50,
  sessionConfig: {
    validationIntervalTicks: 1,
    gracePeriodTicks: 2,
    maxSessionTicks: 3000,
  },
  inputLimits: {
    maxItemIdLength: 64,
    maxStoreIdLength: 64,
    maxQuantity: 2_147_483_647,
    maxInventorySlots: 28,
    maxRequestAgeMs: 5000,
    maxClockSkewMs: 1000,
  },
};

describe("InteractionManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = InteractionManifestSchema.safeParse(
      hyperscapeInteractionManifest,
    );
    if (!result.success) {
      throw new Error(
        `Hyperscape interaction manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects wrong schema version", () => {
    const wrong = {
      ...hyperscapeInteractionManifest,
      $schema: "hyperforge.interaction.v0",
    };
    const result = InteractionManifestSchema.safeParse(wrong);
    expect(result.success).toBe(false);
  });

  it("rejects zero interaction distance", () => {
    const bad = {
      ...hyperscapeInteractionManifest,
      interactionDistance: {
        ...hyperscapeInteractionManifest.interactionDistance,
        store: 0,
      },
    };
    const result = InteractionManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects negative rate limit", () => {
    const bad = {
      ...hyperscapeInteractionManifest,
      transactionRateLimitMs: -1,
    };
    const result = InteractionManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
