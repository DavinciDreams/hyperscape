/**
 * Faithfulness + defensiveness tests for `LoadoutsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { LoadoutsManifestSchema, type LoadoutsManifest } from "./loadouts.js";

const reference: LoadoutsManifest = {
  enabled: true,
  maxSlotsPerCharacter: 10,
  freeSlotCount: 3,
  slot: {
    categories: ["equipment", "abilities", "consumables"],
    fullReplacement: true,
    pullFromBags: true,
    pullFromBank: false,
  },
  naming: {
    maxNameLength: 24,
    enforceProfanityFilter: true,
    iconPresetCount: 24,
  },
  swap: {
    policy: "outOfCombat",
    cooldownSec: 10,
    channelTimeSec: 0,
    cancelChannelOnDamage: false,
    autoRestoreOnRespawn: false,
  },
  sharing: {
    allowExport: true,
    allowImport: true,
    allowPartyShare: false,
  },
};

describe("LoadoutsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = LoadoutsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on empty manifest", () => {
    const parsed = LoadoutsManifestSchema.parse({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.maxSlotsPerCharacter).toBe(10);
    expect(parsed.freeSlotCount).toBe(3);
    expect(parsed.slot.categories).toEqual(["equipment", "abilities"]);
    expect(parsed.slot.fullReplacement).toBe(true);
    expect(parsed.slot.pullFromBags).toBe(true);
    expect(parsed.slot.pullFromBank).toBe(false);
    expect(parsed.naming.maxNameLength).toBe(24);
    expect(parsed.naming.iconPresetCount).toBe(24);
    expect(parsed.swap.policy).toBe("outOfCombat");
    expect(parsed.swap.cooldownSec).toBe(10);
    expect(parsed.swap.channelTimeSec).toBe(0);
    expect(parsed.swap.cancelChannelOnDamage).toBe(false);
    expect(parsed.sharing.allowExport).toBe(true);
    expect(parsed.sharing.allowImport).toBe(true);
    expect(parsed.sharing.allowPartyShare).toBe(false);
  });

  it("accepts system disabled", () => {
    const ok = { enabled: false, maxSlotsPerCharacter: 0, freeSlotCount: 0 };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects enabled=true with maxSlotsPerCharacter=0", () => {
    const bad = { enabled: true, maxSlotsPerCharacter: 0 };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects freeSlotCount > maxSlotsPerCharacter", () => {
    const bad = { maxSlotsPerCharacter: 5, freeSlotCount: 10 };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts freeSlotCount == maxSlotsPerCharacter (all free)", () => {
    const ok = { maxSlotsPerCharacter: 5, freeSlotCount: 5 };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts freeSlotCount = 0 (all paid)", () => {
    const ok = { maxSlotsPerCharacter: 5, freeSlotCount: 0 };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects maxSlotsPerCharacter > 50", () => {
    const bad = { maxSlotsPerCharacter: 99 };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty categories", () => {
    const bad = {
      slot: {
        categories: [],
        fullReplacement: true,
        pullFromBags: true,
        pullFromBank: false,
      },
    };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate categories", () => {
    const bad = {
      slot: {
        categories: ["equipment", "equipment"],
        fullReplacement: true,
        pullFromBags: true,
        pullFromBank: false,
      },
    };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = {
      slot: {
        categories: ["equipment", "mounts"],
        fullReplacement: true,
        pullFromBags: true,
        pullFromBank: false,
      },
    };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts all 6 categories", () => {
    const ok = {
      slot: {
        categories: [
          "equipment",
          "consumables",
          "abilities",
          "prayers",
          "talents",
          "runes",
        ],
        fullReplacement: true,
        pullFromBags: true,
        pullFromBank: false,
      },
    };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts sparse-overlay mode (fullReplacement=false)", () => {
    const ok = {
      slot: {
        categories: ["equipment"],
        fullReplacement: false,
        pullFromBags: true,
        pullFromBank: false,
      },
    };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown swap policy", () => {
    const bad = { swap: { policy: "anywhere" } };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts safeZoneOnly policy", () => {
    const ok = { swap: { policy: "safeZoneOnly" } };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts always policy", () => {
    const ok = { swap: { policy: "always" } };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects cooldownSec > 600", () => {
    const bad = { swap: { cooldownSec: 9999 } };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts cooldownSec=0 (instant repeat)", () => {
    const ok = { swap: { cooldownSec: 0 } };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects channelTimeSec > 60", () => {
    const bad = { swap: { channelTimeSec: 999 } };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cancelChannelOnDamage=true with channelTimeSec=0", () => {
    const bad = {
      swap: { channelTimeSec: 0, cancelChannelOnDamage: true },
    };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts cancelChannelOnDamage=true with channelTimeSec>0", () => {
    const ok = {
      swap: { channelTimeSec: 3, cancelChannelOnDamage: true },
    };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts autoRestoreOnRespawn=true", () => {
    const ok = { swap: { autoRestoreOnRespawn: true } };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects allowPartyShare=true when allowExport=false", () => {
    const bad = {
      sharing: {
        allowExport: false,
        allowImport: true,
        allowPartyShare: true,
      },
    };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects allowPartyShare=true when allowImport=false", () => {
    const bad = {
      sharing: {
        allowExport: true,
        allowImport: false,
        allowPartyShare: true,
      },
    };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts allowPartyShare=true when both export+import enabled", () => {
    const ok = {
      sharing: {
        allowExport: true,
        allowImport: true,
        allowPartyShare: true,
      },
    };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts read-only share (export=true, import=false)", () => {
    const ok = {
      sharing: {
        allowExport: true,
        allowImport: false,
        allowPartyShare: false,
      },
    };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects maxNameLength > 60", () => {
    const bad = { naming: { maxNameLength: 999 } };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts maxNameLength=0 (names disabled)", () => {
    const ok = { naming: { maxNameLength: 0 } };
    expect(LoadoutsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects iconPresetCount > 200", () => {
    const bad = { naming: { iconPresetCount: 9999 } };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = { extra: "nope" };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown field on slot (strict mode)", () => {
    const bad = { slot: { extra: "nope" } };
    expect(LoadoutsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
