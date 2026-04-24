import { LoadoutsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { LoadoutPolicyRegistry } from "../LoadoutPolicyRegistry.js";

function policy() {
  return LoadoutsManifestSchema.parse({
    enabled: true,
    maxSlotsPerCharacter: 10,
    freeSlotCount: 3,
    slot: {
      categories: ["equipment", "abilities"],
    },
    naming: { maxNameLength: 24 },
    swap: {
      policy: "outOfCombat",
      cooldownSec: 10,
      channelTimeSec: 0,
      cancelChannelOnDamage: false,
    },
    sharing: {
      allowExport: true,
      allowImport: true,
      allowPartyShare: true,
    },
  });
}

describe("LoadoutPolicyRegistry — basics", () => {
  it("reports enabled", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.isEnabled()).toBe(true);
    expect(r.maxSlots()).toBe(10);
    expect(r.freeSlotCount()).toBe(3);
  });

  it("isFreeSlot respects boundary", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.isFreeSlot(0)).toBe(true);
    expect(r.isFreeSlot(2)).toBe(true);
    expect(r.isFreeSlot(3)).toBe(false);
  });

  it("isCategoryAllowed", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.isCategoryAllowed("equipment")).toBe(true);
    expect(r.isCategoryAllowed("prayers")).toBe(false);
  });
});

describe("LoadoutPolicyRegistry — checkSwap", () => {
  const baseCtx = {
    slotIndex: 0,
    inCombat: false,
    inSafeZone: true,
    secondsSinceLastSwap: 1000,
  };

  it("allows valid swap", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.checkSwap(baseCtx).allowed).toBe(true);
  });

  it("blocks in combat", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.checkSwap({ ...baseCtx, inCombat: true }).reason).toBe(
      "in-combat",
    );
  });

  it("blocks on cooldown", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.checkSwap({ ...baseCtx, secondsSinceLastSwap: 1 }).reason).toBe(
      "cooldown",
    );
  });

  it("blocks invalid slot", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.checkSwap({ ...baseCtx, slotIndex: 99 }).reason).toBe(
      "invalid-slot",
    );
  });
});

describe("LoadoutPolicyRegistry — checkSave", () => {
  const baseCtx = {
    slotIndex: 0,
    premiumSlotsUnlocked: 0,
    name: "PvP",
    categoriesSnapshot: ["equipment" as const],
  };

  it("allows free-slot save", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.checkSave(baseCtx).allowed).toBe(true);
  });

  it("blocks paid slot without unlock", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.checkSave({ ...baseCtx, slotIndex: 5 }).reason).toBe(
      "free-slot-only",
    );
  });

  it("allows paid slot with unlock", () => {
    const r = new LoadoutPolicyRegistry(policy());
    // slotIndex=5 → premiumIndex=2, need >= 3 unlocks
    expect(
      r.checkSave({ ...baseCtx, slotIndex: 5, premiumSlotsUnlocked: 3 })
        .allowed,
    ).toBe(true);
  });

  it("rejects oversized name", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.checkSave({ ...baseCtx, name: "x".repeat(50) }).reason).toBe(
      "name-too-long",
    );
  });

  it("rejects empty category list", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.checkSave({ ...baseCtx, categoriesSnapshot: [] }).reason).toBe(
      "no-categories",
    );
  });
});

describe("LoadoutPolicyRegistry — sharing", () => {
  it("canExport", () => {
    const r = new LoadoutPolicyRegistry(policy());
    expect(r.canExport()).toBe(true);
    expect(r.canImport()).toBe(true);
    expect(r.canPartyShare()).toBe(true);
  });
});
