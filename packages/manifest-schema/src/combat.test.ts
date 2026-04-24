/**
 * Faithfulness test: a combat manifest built from the values currently
 * hardcoded in `packages/shared/src/constants/CombatConstants.ts` MUST parse
 * cleanly. If this test fails, the extraction is not behavior-preserving and
 * we're about to regress Hyperscape.
 */

import { describe, expect, it } from "vitest";

import { CombatManifestSchema, type CombatManifest } from "./combat.js";

const hyperscapeCombatManifest: CombatManifest = {
  $schema: "hyperforge.combat.v1",

  ranges: {
    ranged: 10,
    magic: 10,
    meleeStandard: 1,
    meleeHalberd: 2,
    pickup: 2.5,
  },
  ticks: {
    tickDurationMs: 600,
    defaultAttackSpeedTicks: 4,
    combatTimeoutTicks: 17,
    logoutPreventionTicks: 16,
    healthRegenCooldownTicks: 17,
    healthRegenIntervalTicks: 100,
    afkDisableRetaliateTicks: 2000,
  },
  food: {
    eatDelayTicks: 3,
    eatAttackDelayTicks: 3,
    maxHealAmount: 99,
  },
  hitDelay: {
    meleeBase: 0,
    rangedBase: 1,
    rangedDistanceOffset: 3,
    rangedDistanceDivisor: 6,
    magicBase: 1,
    magicDistanceOffset: 1,
    magicDistanceDivisor: 3,
    maxHitDelay: 10,
  },
  projectiles: {
    spellLaunchDelayMs: 600,
    arrowLaunchDelayMs: 400,
  },
  rotation: {
    combatSlerpSpeed: 20.0,
    movementSlerpSpeed: 12.0,
    facingMaxDistance: 20,
    minRotationDistanceSq: 0.25,
  },
  animation: {
    hitFrameRatio: 0.5,
    minAnimationTicks: 2,
    hitsplatDelayTicks: 0,
    hitsplatDurationTicks: 2,
    emoteCombat: "combat",
    emoteSwordSwing: "sword_swing",
    emote2hSlash: "2h_slash",
    emote2hIdle: "2h_idle",
    emoteRanged: "ranged",
    emoteMagic: "magic",
    emoteIdle: "idle",
    crossfadeDuration: 0.35,
  },
  death: {
    respawnTicksRandomness: 8,
    gravestoneTicks: 1500,
    groundItemDespawnTicks: 6000,
    untradeableDespawnTicks: 6000,
    lootProtectionTicks: 100,
    corpseDespawnTicks: 200,
    animationTicks: 7,
    cooldownTicks: 17,
    reconnectRespawnDelayTicks: 1,
    staleLockAgeTicks: 3000,
    defaultRespawnPosition: { x: 0, y: 0, z: 0 },
    defaultRespawnTown: "Central Haven",
  },
  damage: {
    baseConstant: 64,
    effectiveLevelConstant: 8,
    damageDivisor: 640,
    minDamage: 0,
    maxDamage: 200,
  },
  xp: {
    combatXpPerDamage: 4,
    hitpointsXpPerDamage: 1.33,
    controlledXpPerDamage: 1.33,
  },
  npcDefaults: {
    attackSpeedTicks: 4,
    aggroRange: 4,
    combatRange: 1,
    leashRange: 42,
    respawnTicks: 25,
    wanderRadius: 5,
  },
  itemDefaults: {
    attackSpeed: 4,
    attackRange: 1,
  },
  aggro: {
    defaultBehavior: "passive",
    updateIntervalMs: 100,
    alwaysAggressiveLevel: 999,
  },
  levels: {
    defaultCombatLevel: 3,
    minCombatLevel: 3,
    maxLevel: 99,
    xpBase: 50,
    xpGrowthFactor: 8,
    combatLevelWeights: {
      defenseWeight: 0.25,
      offenseWeight: 0.325,
      rangedMultiplier: 1.5,
    },
  },
  weaponDefaultAttackStyle: {
    sword: "slash",
    longsword: "slash",
    scimitar: "slash",
    axe: "slash",
    mace: "crush",
    dagger: "stab",
    spear: "stab",
    two_hand_sword: "slash",
    halberd: "slash",
    none: "crush",
  },
  rangedStyleBonuses: {
    accurate: {
      attackBonus: 3,
      speedModifier: 0,
      rangeModifier: 0,
      xpSplit: "ranged",
    },
    rapid: {
      attackBonus: 0,
      speedModifier: -1,
      rangeModifier: 0,
      xpSplit: "ranged",
    },
    longrange: {
      attackBonus: 0,
      speedModifier: 0,
      rangeModifier: 2,
      xpSplit: "ranged_defence",
    },
  },
  magicStyleBonuses: {
    accurate: {
      attackBonus: 3,
      speedModifier: 0,
      rangeModifier: 0,
      xpSplit: "magic",
    },
    longrange: {
      attackBonus: 1,
      speedModifier: 0,
      rangeModifier: 2,
      xpSplit: "magic_defence",
    },
    autocast: {
      attackBonus: 0,
      speedModifier: 0,
      rangeModifier: 0,
      xpSplit: "magic",
    },
  },
};

describe("CombatManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = CombatManifestSchema.safeParse(hyperscapeCombatManifest);
    if (!result.success) {
      throw new Error(
        `Hyperscape reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const broken = { ...hyperscapeCombatManifest } as Partial<CombatManifest>;
    delete broken.ranges;
    const result = CombatManifestSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("rejects wrong schema version", () => {
    const wrong = {
      ...hyperscapeCombatManifest,
      $schema: "hyperforge.combat.v0",
    };
    const result = CombatManifestSchema.safeParse(wrong);
    expect(result.success).toBe(false);
  });

  it("rejects negative tick durations", () => {
    const bad = {
      ...hyperscapeCombatManifest,
      ticks: { ...hyperscapeCombatManifest.ticks, tickDurationMs: -600 },
    };
    const result = CombatManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
