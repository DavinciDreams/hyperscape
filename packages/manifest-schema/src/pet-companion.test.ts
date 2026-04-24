/**
 * Faithfulness + defensiveness tests for `PetCompanionManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  PetCompanionManifestSchema,
  type PetCompanionManifest,
} from "./pet-companion.js";

const reference: PetCompanionManifest = [
  {
    id: "wolfCub",
    name: "Wolf Cub",
    description: "Loyal combat companion.",
    iconId: "icon.wolfCub",
    category: "combat",
    modelId: "avatar.wolfCub",
    idleAnimationId: "anim.wolfIdle",
    summonVfxId: "vfx.summonBeast",
    summonSfxId: "sfx.bark",
    slots: ["collar", "armor"],
    stats: {
      maxHealth: 50,
      baseAttack: 8,
      baseDefense: 4,
      moveSpeed: 6,
      ownerStatScaling: 0.3,
    },
    abilities: [
      { id: "petBite", priority: 70, cooldownSec: 3 },
      { id: "petHowl", priority: 40, cooldownSec: 30 },
    ],
    summonRules: {
      allowInCombat: true,
      allowInSafeZones: true,
      allowWhileMounted: false,
      summonCooldownSec: 10,
      maxActive: 1,
      idleDespawnSec: 0,
    },
    followBehavior: "heel",
    progression: {
      enabled: true,
      maxLevel: 30,
      xpPerLevel: 500,
      statGrowthPerLevel: 0.08,
      loyaltyPerInteraction: 2,
    },
    persistent: true,
    persistOnDeath: false,
    tradeable: false,
  },
  {
    id: "bankBox",
    name: "Banker Spirit",
    description: "Pocket banker — utility companion.",
    iconId: "icon.bankBox",
    category: "utility",
    modelId: "avatar.bankBox",
    idleAnimationId: "",
    summonVfxId: "vfx.arcane",
    summonSfxId: "",
    slots: ["charm"],
    stats: {
      maxHealth: 1,
      baseAttack: 0,
      baseDefense: 0,
      moveSpeed: 5,
      ownerStatScaling: 0,
    },
    abilities: [{ id: "openBank", priority: 50, cooldownSec: 0 }],
    summonRules: {
      allowInCombat: false,
      allowInSafeZones: true,
      allowWhileMounted: false,
      summonCooldownSec: 600,
      maxActive: 1,
      idleDespawnSec: 120,
    },
    followBehavior: "loose",
    progression: {
      enabled: false,
      maxLevel: 1,
      xpPerLevel: 100,
      statGrowthPerLevel: 0,
      loyaltyPerInteraction: 0,
    },
    persistent: true,
    persistOnDeath: true,
    tradeable: false,
  },
  {
    id: "firefly",
    name: "Firefly",
    description: "Cosmetic glowing companion.",
    iconId: "icon.firefly",
    category: "cosmetic",
    modelId: "avatar.firefly",
    idleAnimationId: "anim.fireflyHover",
    summonVfxId: "",
    summonSfxId: "",
    slots: [],
    stats: {
      maxHealth: 1,
      baseAttack: 0,
      baseDefense: 0,
      moveSpeed: 5,
      ownerStatScaling: 0,
    },
    abilities: [],
    summonRules: {
      allowInCombat: true,
      allowInSafeZones: true,
      allowWhileMounted: true,
      summonCooldownSec: 1,
      maxActive: 3,
      idleDespawnSec: 0,
    },
    followBehavior: "loose",
    progression: {
      enabled: false,
      maxLevel: 1,
      xpPerLevel: 100,
      statGrowthPerLevel: 0,
      loyaltyPerInteraction: 0,
    },
    persistent: false,
    persistOnDeath: false,
    tradeable: true,
  },
];

describe("PetCompanionManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = PetCompanionManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on minimal entries", () => {
    const parsed = PetCompanionManifestSchema.parse([
      { id: "scamp", name: "Scamp", category: "combat" },
    ]);
    expect(parsed[0].slots).toEqual([]);
    expect(parsed[0].abilities).toEqual([]);
    expect(parsed[0].followBehavior).toBe("heel");
    expect(parsed[0].stats.maxHealth).toBe(10);
    expect(parsed[0].stats.ownerStatScaling).toBeCloseTo(0.25);
    expect(parsed[0].summonRules.maxActive).toBe(1);
    expect(parsed[0].summonRules.allowInCombat).toBe(false);
    expect(parsed[0].summonRules.summonCooldownSec).toBe(5);
    expect(parsed[0].progression.enabled).toBe(false);
    expect(parsed[0].persistent).toBe(true);
    expect(parsed[0].tradeable).toBe(false);
  });

  it("accepts empty manifest", () => {
    expect(PetCompanionManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate pet ids", () => {
    const bad = [
      { id: "dup", name: "A", category: "combat" },
      { id: "dup", name: "B", category: "utility" },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid id format", () => {
    const bad = [{ id: "Has Spaces", name: "Bad", category: "combat" }];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = [{ id: "x", name: "X", category: "mystical" }];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate slot kinds on a pet", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "combat",
        slots: ["armor", "armor"],
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate ability ids on a single pet", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "combat",
        abilities: [
          { id: "petBite", priority: 50, cooldownSec: 0 },
          { id: "petBite", priority: 30, cooldownSec: 0 },
        ],
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cosmetic pet with abilities", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "cosmetic",
        abilities: [{ id: "doThing", priority: 50, cooldownSec: 0 }],
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts combat pet with abilities", () => {
    const ok = [
      {
        id: "x",
        name: "X",
        category: "combat",
        abilities: [{ id: "bite", priority: 50, cooldownSec: 0 }],
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects cosmetic pet with progression enabled", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "cosmetic",
        progression: {
          enabled: true,
          maxLevel: 10,
          xpPerLevel: 100,
          statGrowthPerLevel: 0.05,
          loyaltyPerInteraction: 0,
        },
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid ability id format", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "combat",
        abilities: [{ id: "Has Spaces", priority: 50, cooldownSec: 0 }],
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxActive > 20", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "combat",
        summonRules: {
          allowInCombat: true,
          allowInSafeZones: true,
          allowWhileMounted: false,
          summonCooldownSec: 5,
          maxActive: 100,
          idleDespawnSec: 0,
        },
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects summonCooldownSec > 3600", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "utility",
        summonRules: {
          allowInCombat: false,
          allowInSafeZones: true,
          allowWhileMounted: false,
          summonCooldownSec: 7200,
          maxActive: 1,
          idleDespawnSec: 0,
        },
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects idleDespawnSec > 7200", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "utility",
        summonRules: {
          allowInCombat: false,
          allowInSafeZones: true,
          allowWhileMounted: false,
          summonCooldownSec: 5,
          maxActive: 1,
          idleDespawnSec: 10_000,
        },
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects ownerStatScaling > 1", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "combat",
        stats: {
          maxHealth: 10,
          baseAttack: 0,
          baseDefense: 0,
          moveSpeed: 5,
          ownerStatScaling: 2,
        },
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects statGrowthPerLevel > 1", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "combat",
        progression: {
          enabled: true,
          maxLevel: 10,
          xpPerLevel: 100,
          statGrowthPerLevel: 5,
          loyaltyPerInteraction: 0,
        },
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxLevel > 100", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "combat",
        progression: {
          enabled: true,
          maxLevel: 500,
          xpPerLevel: 100,
          statGrowthPerLevel: 0.05,
          loyaltyPerInteraction: 0,
        },
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown slot kind", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "combat",
        slots: ["helmet"],
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown follow behavior", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "combat",
        followBehavior: "orbit",
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts cosmetic pet with maxActive > 1 (swarm)", () => {
    const ok = [
      {
        id: "x",
        name: "X",
        category: "cosmetic",
        summonRules: {
          allowInCombat: true,
          allowInSafeZones: true,
          allowWhileMounted: true,
          summonCooldownSec: 1,
          maxActive: 10,
          idleDespawnSec: 0,
        },
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects abilities on a utility pet if ability id is malformed", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "utility",
        abilities: [{ id: "7bad", priority: 50, cooldownSec: 0 }],
      },
    ];
    expect(PetCompanionManifestSchema.safeParse(bad).success).toBe(false);
  });
});
