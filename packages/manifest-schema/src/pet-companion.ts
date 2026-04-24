/**
 * Pet / companion manifest schema.
 *
 * Authored registry for summonable entities that follow a player —
 * combat pets (damage/tank), utility pets (bank-in-a-pocket, gathering
 * helper), and cosmetic companions (purely visual). Each entry captures
 * the pet's lifecycle (summon/dismiss/despawn), its base stats, its
 * ability references, its progression rules, and the slot layout used
 * when authoring per-pet gear.
 *
 * Scope: authored registry. Runtime `PetSystem` handles summon/dismiss,
 * ability ticking, follow/stay AI, and xp application — all separate
 * follow-ups.
 *
 * Deliberately isolated from `npcs.ts` (hostile/neutral world mobs) and
 * `avatars.ts` (player rigs). Pets are player-owned, summonable, and
 * have their own per-owner progression state.
 */

import { z } from "zod";

/** PetId — lowerCamelCase ASCII identifier. */
const PetId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "pet id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/**
 * Category — coarse classification driving UI grouping, summon rules,
 * and whether the pet participates in combat math.
 */
export const PetCategorySchema = z.enum(["combat", "utility", "cosmetic"]);
export type PetCategory = z.infer<typeof PetCategorySchema>;

/**
 * Slot kinds a pet can equip. A pet defines the subset of slots it
 * supports; the editor uses this to render only meaningful slots in
 * the pet's inventory panel.
 */
export const PetSlotSchema = z.enum([
  "saddle",
  "armor",
  "collar",
  "charm",
  "satchel",
]);
export type PetSlot = z.infer<typeof PetSlotSchema>;

/** Follow behavior when idle. */
export const PetFollowBehaviorSchema = z.enum([
  "heel",
  "loose",
  "stay",
  "patrol",
]);
export type PetFollowBehavior = z.infer<typeof PetFollowBehaviorSchema>;

/** Summon rules — when/where a pet can be called. */
export const PetSummonRulesSchema = z
  .object({
    /** If true, pet can be summoned in combat. */
    allowInCombat: z.boolean().default(false),
    /** If true, pet can be summoned in safe zones (towns). */
    allowInSafeZones: z.boolean().default(true),
    /** If true, pet can be summoned while mounted. */
    allowWhileMounted: z.boolean().default(false),
    /** Cooldown between successive summons. */
    summonCooldownSec: z.number().min(0).max(3600).default(5),
    /**
     * Max simultaneous active instances (default 1 — one pet out at a
     * time). Values >1 enable minion-swarm semantics.
     */
    maxActive: z.number().int().min(1).max(20).default(1),
    /** Despawn after this many seconds idle (0 = never). */
    idleDespawnSec: z.number().min(0).max(7200).default(0),
  })
  .strict();
export type PetSummonRules = z.infer<typeof PetSummonRulesSchema>;

/**
 * Per-pet base stats for combat-category pets. Utility/cosmetic pets
 * can leave these at defaults — runtime skips combat math if category
 * !== "combat".
 */
export const PetStatsSchema = z
  .object({
    maxHealth: z.number().int().min(1).max(1_000_000).default(10),
    baseAttack: z.number().int().min(0).max(100_000).default(0),
    baseDefense: z.number().int().min(0).max(100_000).default(0),
    moveSpeed: z.number().min(0).max(50).default(5),
    /**
     * Scaling applied to owner stats (0..1). 0.5 = pet inherits 50% of
     * owner's relevant stat as damage bonus. Used by combat pets to
     * stay relevant across owner progression.
     */
    ownerStatScaling: z.number().min(0).max(1).default(0.25),
  })
  .strict();
export type PetStats = z.infer<typeof PetStatsSchema>;

/**
 * Ability the pet can use. Shape-only manifest reference — loader
 * resolves against `ai-behavior.ts` / `combat-spells.ts` depending on
 * pet category.
 */
export const PetAbilitySchema = z
  .object({
    id: ManifestRef,
    /** Priority for auto-cast (higher wins). */
    priority: z.number().int().min(0).max(100).default(50),
    /** Cooldown between successive auto-cast attempts. */
    cooldownSec: z.number().min(0).max(3600).default(0),
  })
  .strict();
export type PetAbility = z.infer<typeof PetAbilitySchema>;

/**
 * Progression rule. Combat pets gain xp from owner kills; utility pets
 * from gather events; cosmetic pets usually have `enabled: false`.
 */
export const PetProgressionSchema = z
  .object({
    enabled: z.boolean().default(false),
    maxLevel: z.number().int().min(1).max(100).default(1),
    /** XP required per level (flat per-level value). */
    xpPerLevel: z.number().min(1).max(10_000_000).default(100),
    /** Stat growth per level-up (applied to base stats). */
    statGrowthPerLevel: z.number().min(0).max(1).default(0.05),
    /**
     * Loyalty points gained per owner interaction (feed/pet). Drives
     * morale/bond UI but not required for progression.
     */
    loyaltyPerInteraction: z.number().min(0).max(1000).default(1),
  })
  .strict();
export type PetProgression = z.infer<typeof PetProgressionSchema>;

export const PetSchema = z
  .object({
    id: PetId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    category: PetCategorySchema,
    /** Model/rig id resolved against `avatars.ts`. */
    modelId: z.string().default(""),
    /** Optional idle animation id (resolved against `animations.ts`). */
    idleAnimationId: z.string().default(""),
    /** Optional summon VFX id (resolved against `vfx.ts`). */
    summonVfxId: z.string().default(""),
    /** Optional summon SFX id (resolved against `sfx.ts`). */
    summonSfxId: z.string().default(""),
    /** Supported equipment slots. */
    slots: z.array(PetSlotSchema).default([]),
    stats: PetStatsSchema.default(() => PetStatsSchema.parse({})),
    abilities: z.array(PetAbilitySchema).default([]),
    summonRules: PetSummonRulesSchema.default(() =>
      PetSummonRulesSchema.parse({}),
    ),
    followBehavior: PetFollowBehaviorSchema.default("heel"),
    progression: PetProgressionSchema.default(() =>
      PetProgressionSchema.parse({}),
    ),
    /** If true, pet persists across logout (saved to character slot). */
    persistent: z.boolean().default(true),
    /** If true, pet survives the owner's death. */
    persistOnDeath: z.boolean().default(false),
    /** If true, pet is tradeable between players. */
    tradeable: z.boolean().default(false),
  })
  .strict()
  .refine(({ slots }) => new Set(slots).size === slots.length, {
    message: "pet slot list must not repeat a slot kind",
  })
  .refine(
    ({ abilities }) =>
      new Set(abilities.map((a) => a.id)).size === abilities.length,
    { message: "pet ability ids must be unique within a pet" },
  )
  .refine(
    ({ category, abilities }) =>
      category === "cosmetic" ? abilities.length === 0 : true,
    { message: "cosmetic pets cannot declare abilities" },
  )
  .refine(
    ({ category, progression }) =>
      category === "cosmetic" ? progression.enabled === false : true,
    { message: "cosmetic pets cannot have progression enabled" },
  );
export type Pet = z.infer<typeof PetSchema>;

/**
 * Manifest is a bare array of pet entries with a unique-id refinement.
 */
export const PetCompanionManifestSchema = z
  .array(PetSchema)
  .refine((arr) => new Set(arr.map((p) => p.id)).size === arr.length, {
    message: "pet ids must be unique",
  });
export type PetCompanionManifest = z.infer<typeof PetCompanionManifestSchema>;
