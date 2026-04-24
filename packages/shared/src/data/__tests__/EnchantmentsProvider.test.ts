/**
 * Tests for the EnchantmentsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { enchantmentsProvider } from "../EnchantmentsProvider";

beforeEach(() => {
  enchantmentsProvider.unload();
});
afterEach(() => {
  enchantmentsProvider.unload();
});

const validEnchant = {
  id: "strength_boost",
  name: "Strength Boost",
  kind: "permanent" as const,
  slots: ["weapon"] as const,
  maxTier: 3,
  modifiers: [
    {
      stat: "strength" as const,
      op: "add" as const,
      tiers: [
        { tier: 1, value: 1 },
        { tier: 2, value: 2 },
        { tier: 3, value: 4 },
      ],
    },
  ],
};

describe("EnchantmentsProvider", () => {
  it("starts unloaded", () => {
    expect(enchantmentsProvider.isLoaded()).toBe(false);
    expect(enchantmentsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = enchantmentsProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(enchantmentsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid enchantment", () => {
    const parsed = enchantmentsProvider.loadRaw([validEnchant]);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("strength_boost");
  });

  it("loadRaw() rejects duplicate ids", () => {
    expect(() =>
      enchantmentsProvider.loadRaw([
        validEnchant,
        { ...validEnchant, name: "Dup" },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects `any` combined with specific slot", () => {
    expect(() =>
      enchantmentsProvider.loadRaw([
        { ...validEnchant, slots: ["any", "weapon"] as const },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects duplicate slots", () => {
    expect(() =>
      enchantmentsProvider.loadRaw([
        { ...validEnchant, slots: ["weapon", "weapon"] as const },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects temporary kind without durationHits>0", () => {
    expect(() =>
      enchantmentsProvider.loadRaw([
        { ...validEnchant, kind: "temporary" as const, durationHits: 0 },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects non-temporary kind with durationHits>0", () => {
    expect(() =>
      enchantmentsProvider.loadRaw([{ ...validEnchant, durationHits: 10 }]),
    ).toThrow();
  });

  it("loadRaw() rejects modifier tier exceeding maxTier", () => {
    expect(() =>
      enchantmentsProvider.loadRaw([
        {
          ...validEnchant,
          maxTier: 2,
          modifiers: [
            {
              stat: "strength" as const,
              op: "add" as const,
              tiers: [
                { tier: 1, value: 1 },
                { tier: 3, value: 5 },
              ],
            },
          ],
        },
      ]),
    ).toThrow();
  });

  it("hotReload(null) clears the manifest", () => {
    enchantmentsProvider.loadRaw([validEnchant]);
    enchantmentsProvider.hotReload(null);
    expect(enchantmentsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    enchantmentsProvider.loadRaw([validEnchant]);
    enchantmentsProvider.unload();
    expect(enchantmentsProvider.isLoaded()).toBe(false);
  });
});
