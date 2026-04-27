import { InteractionManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  InteractionConfigNotLoadedError,
  InteractionConfigRegistry,
} from "../InteractionConfigRegistry.js";

function manifest() {
  return InteractionManifestSchema.parse({
    $schema: "hyperforge.interaction.v1",
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
    transactionRateLimitMs: 500,
    sessionConfig: {
      validationIntervalTicks: 5,
      gracePeriodTicks: 3,
      maxSessionTicks: 600,
    },
    inputLimits: {
      maxItemIdLength: 64,
      maxStoreIdLength: 64,
      maxQuantity: 2_147_483_647,
      maxInventorySlots: 28,
      maxRequestAgeMs: 60_000,
      maxClockSkewMs: 5_000,
    },
  });
}

describe("InteractionConfigRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new InteractionConfigRegistry().manifest).toThrow(
      InteractionConfigNotLoadedError,
    );
  });

  it("maxDistanceFor + isInRange uses Chebyshev", () => {
    const r = new InteractionConfigRegistry(manifest());
    expect(r.maxDistanceFor("dialogue")).toBe(3);
    expect(r.isInRange("dialogue", { x: 0, z: 0 }, { x: 3, z: 3 })).toBe(true);
    expect(r.isInRange("dialogue", { x: 0, z: 0 }, { x: 4, z: 0 })).toBe(false);
    expect(r.isInRange("store", { x: 0, z: 0 }, { x: 2, z: 2 })).toBe(true);
    expect(r.isInRange("store", { x: 0, z: 0 }, { x: 3, z: 0 })).toBe(false);
  });

  it("input-limit validators", () => {
    const r = new InteractionConfigRegistry(manifest());
    expect(r.isValidItemId("apple")).toBe(true);
    expect(r.isValidItemId("")).toBe(false);
    expect(r.isValidItemId("x".repeat(65))).toBe(false);
    expect(r.isValidQuantity(1)).toBe(true);
    expect(r.isValidQuantity(0)).toBe(false);
    expect(r.isValidQuantity(1.5)).toBe(false);
    expect(r.isValidInventorySlot(0)).toBe(true);
    expect(r.isValidInventorySlot(27)).toBe(true);
    expect(r.isValidInventorySlot(28)).toBe(false);
    expect(r.isValidInventorySlot(-1)).toBe(false);
  });

  it("isRequestFresh handles age + skew", () => {
    const r = new InteractionConfigRegistry(manifest());
    const now = 1_000_000;
    expect(r.isRequestFresh(now - 30_000, now)).toBe(true);
    expect(r.isRequestFresh(now - 70_000, now)).toBe(false); // too old
    expect(r.isRequestFresh(now + 10_000, now)).toBe(false); // too far future
    expect(r.isRequestFresh(now + 3_000, now)).toBe(true); // within skew
  });
});

describe("InteractionConfigRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new InteractionConfigRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new InteractionConfigRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new InteractionConfigRegistry();
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
