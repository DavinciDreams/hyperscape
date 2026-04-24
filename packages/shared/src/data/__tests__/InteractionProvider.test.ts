/**
 * Tests for the InteractionProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { interactionProvider } from "../InteractionProvider";

beforeEach(() => {
  interactionProvider.unload();
});
afterEach(() => {
  interactionProvider.unload();
});

const baseline = {
  $schema: "hyperforge.interaction.v1" as const,
  sessionTypes: {
    store: "store",
    bank: "bank",
    dialogue: "dialogue",
  },
  interactionDistance: {
    store: 2,
    bank: 2,
    dialogue: 3,
  },
  transactionRateLimitMs: 250,
  sessionConfig: {
    validationIntervalTicks: 10,
    gracePeriodTicks: 0,
    maxSessionTicks: 600,
  },
  inputLimits: {
    maxItemIdLength: 64,
    maxStoreIdLength: 64,
    maxQuantity: 2_147_483_647,
    maxInventorySlots: 28,
    maxRequestAgeMs: 10_000,
    maxClockSkewMs: 5_000,
  },
};

describe("InteractionProvider", () => {
  it("starts unloaded", () => {
    expect(interactionProvider.isLoaded()).toBe(false);
    expect(interactionProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — all fields required", () => {
    expect(() => interactionProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts a minimal valid manifest", () => {
    const parsed = interactionProvider.loadRaw(baseline);
    expect(parsed.$schema).toBe("hyperforge.interaction.v1");
    expect(parsed.sessionTypes.store).toBe("store");
    expect(parsed.interactionDistance.bank).toBe(2);
    expect(parsed.transactionRateLimitMs).toBe(250);
  });

  it("loadRaw() rejects missing sessionTypes fields", () => {
    expect(() =>
      interactionProvider.loadRaw({
        ...baseline,
        sessionTypes: { store: "store", bank: "bank" },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects non-positive transactionRateLimitMs", () => {
    expect(() =>
      interactionProvider.loadRaw({
        ...baseline,
        transactionRateLimitMs: 0,
      }),
    ).toThrow();
  });

  it("loadRaw() rejects non-positive interaction distance", () => {
    expect(() =>
      interactionProvider.loadRaw({
        ...baseline,
        interactionDistance: { ...baseline.interactionDistance, store: 0 },
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = interactionProvider.loadRaw(baseline);
    interactionProvider.unload();
    interactionProvider.load(parsed);
    expect(interactionProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    interactionProvider.loadRaw(baseline);
    interactionProvider.hotReload(null);
    expect(interactionProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(interactionProvider).toBe(interactionProvider);
  });
});
