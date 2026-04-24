/**
 * Item-sets manifest schema.
 *
 * Authored registry of equipment sets — named collections of gear pieces
 * that grant incremental bonuses as the wearer equips more pieces of the
 * set (the Diablo 2 / WoW Tier Set / Destiny Exotic Armor pattern).
 * Each entry declares its member item ids, its incremental bonus stages
 * (2pc/4pc/6pc etc.), and the per-stage stat modifiers or triggered
 * effects.
 *
 * Scope: authored registry. Runtime `ItemSetSystem` owns per-player
 * "how many pieces equipped" tracking, stage transitions as items are
 * swapped, stat-modifier application, triggered-effect binding to the
 * combat event bus, and the UI stage indicator — all separate follow-ups.
 *
 * Scope-isolated from `equipment.ts` (item definitions are independent),
 * `enchantments.ts` (set bonuses are position-by-collection, enchants
 * are per-item modifiers) and `status-effects.ts` (triggered effects
 * reference status-effect ids, resolved shape-only).
 */

import { z } from "zod";

/** ItemSetId — lowerCamelCase ASCII identifier. */
const ItemSetId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "item-set id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/**
 * Set bonus category — drives UI color + tooltip grouping. `raid` sets
 * have a "raid tier N" convention; `crafted` sets are player-made;
 * `dungeon` sets drop from group content; `world` sets from open-world
 * quests; `pvp` sets from arenas/battlegrounds; `legacy` sets are
 * retired content kept for collection completeness.
 */
export const ItemSetCategorySchema = z.enum([
  "raid",
  "dungeon",
  "crafted",
  "world",
  "pvp",
  "legacy",
]);
export type ItemSetCategory = z.infer<typeof ItemSetCategorySchema>;

/**
 * Stat modifier kind — matches `status-effects.ts` stat vocabulary
 * (intentional shared vocabulary) plus set-specific stats.
 */
export const ItemSetStatKindSchema = z.enum([
  "attack",
  "strength",
  "defense",
  "ranged",
  "magic",
  "hitpoints",
  "prayer",
  "accuracy",
  "evasion",
  "moveSpeed",
  "attackSpeed",
  "castSpeed",
  "damageTaken",
  "damageDealt",
  "healing",
  "armor",
  "critChance",
  "critDamage",
  "lifesteal",
  "manaRegen",
]);
export type ItemSetStatKind = z.infer<typeof ItemSetStatKindSchema>;

/**
 * Stat modifier op — matches `enchantments.ts` vocabulary.
 * `add` = flat add/subtract; `multiply` = multiplicative. No `override`
 * (set bonuses layer on top, they don't replace).
 */
export const ItemSetStatOpSchema = z.enum(["add", "multiply"]);
export type ItemSetStatOp = z.infer<typeof ItemSetStatOpSchema>;

/**
 * Per-stage stat modifier.
 */
export const ItemSetStatModifierSchema = z
  .object({
    stat: ItemSetStatKindSchema,
    op: ItemSetStatOpSchema,
    /**
     * For `add` — the added amount (may be negative for trade-offs).
     * For `multiply` — the multiplier (must be > 0; use `add` with
     * negatives for debuff trade-offs to stay consistent with
     * `enchantments.ts`).
     */
    value: z.number(),
  })
  .strict()
  .refine(({ op, value }) => op !== "multiply" || value > 0, {
    message:
      "multiply op requires value > 0 (use `add` with a negative value for trade-offs)",
  });
export type ItemSetStatModifier = z.infer<typeof ItemSetStatModifierSchema>;

/**
 * Triggered effect — fires in response to an in-game event once the set
 * reaches the stage's piece count. Shape-only; runtime binds via the
 * combat event bus.
 */
export const ItemSetTriggeredEffectSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "triggered-effect id must be lowerCamelCase ASCII identifier",
      ),
    /**
     * Trigger event id (shape-only). Runtime resolves against its
     * registered event names (e.g. "onCritHit", "onAbilityCast",
     * "onTakeDamage").
     */
    triggerEventId: ManifestRef,
    /**
     * Probability per trigger (0..1). 1 = always fires.
     */
    chance: z.number().min(0).max(1).default(1),
    /** Internal cooldown in seconds (prevents proc-storm). 0 = none. */
    cooldownSec: z.number().min(0).max(3600).default(0),
    /**
     * Status-effect id applied on trigger (shape-only; resolves against
     * `status-effects.ts`). Empty = no status effect (trigger may still
     * deal flat damage/heal via `damageAmount`/`healAmount`).
     */
    statusEffectId: z.string().default(""),
    /** Flat damage dealt to the event target on trigger. 0 = none. */
    damageAmount: z.number().int().min(0).max(1_000_000).default(0),
    /** Flat heal applied to the wearer on trigger. 0 = none. */
    healAmount: z.number().int().min(0).max(1_000_000).default(0),
    /** Human-readable tooltip shown on the set piece UI. */
    description: z.string().default(""),
  })
  .strict()
  .refine(
    ({ statusEffectId, damageAmount, healAmount }) =>
      statusEffectId !== "" || damageAmount > 0 || healAmount > 0,
    {
      message:
        "triggered effect must do something — set at least one of statusEffectId, damageAmount, or healAmount",
    },
  );
export type ItemSetTriggeredEffect = z.infer<
  typeof ItemSetTriggeredEffectSchema
>;

/**
 * Set bonus stage — unlocks when `requiredPieces` set items are equipped.
 */
export const ItemSetStageSchema = z
  .object({
    /**
     * Number of set items equipped to unlock this stage. 2pc/4pc/6pc is
     * typical; can go up to the set's member count.
     */
    requiredPieces: z.number().int().min(2).max(20),
    /** Human label shown in the UI (e.g. "2-Piece Bonus"). */
    label: z.string().default(""),
    /** Free-form flavor/description text. */
    description: z.string().default(""),
    /**
     * Stat modifiers granted at this stage. Empty = stage has only
     * triggered effects (or is documentation-only).
     */
    statModifiers: z.array(ItemSetStatModifierSchema).default([]),
    /** Triggered effects granted at this stage. */
    triggeredEffects: z.array(ItemSetTriggeredEffectSchema).default([]),
  })
  .strict()
  .refine(
    ({ statModifiers, triggeredEffects }) =>
      statModifiers.length > 0 || triggeredEffects.length > 0,
    {
      message:
        "set stage must grant at least one stat modifier or triggered effect (an empty stage is dead config)",
    },
  )
  .refine(
    ({ triggeredEffects }) =>
      new Set(triggeredEffects.map((e) => e.id)).size ===
      triggeredEffects.length,
    { message: "triggered-effect ids must be unique within a stage" },
  );
export type ItemSetStage = z.infer<typeof ItemSetStageSchema>;

export const ItemSetSchema = z
  .object({
    id: ItemSetId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    category: ItemSetCategorySchema,
    /** Tier number (1..N). Free-form author convention for ordering. 0 = untiered. */
    tier: z.number().int().min(0).max(100).default(0),
    /**
     * Level range where the set is relevant (runtime scales bonuses or
     * restricts activation — per-game policy).
     */
    minLevel: z.number().int().min(1).max(100).default(1),
    maxLevel: z.number().int().min(1).max(100).default(100),
    /**
     * Member item ids (ManifestRef, shape-only). Order is stable for
     * display; runtime matches by id, not by position.
     */
    memberItemIds: z.array(ManifestRef).min(2).max(20),
    /** Ordered stages, authored in increasing `requiredPieces` order. */
    stages: z.array(ItemSetStageSchema).min(1),
    /** UI color (#rrggbb). Empty = renderer picks based on category. */
    color: z
      .string()
      .regex(/^(#[0-9a-fA-F]{6})?$/, "color must be `#rrggbb` or empty string")
      .default(""),
  })
  .strict()
  .refine(({ minLevel, maxLevel }) => minLevel <= maxLevel, {
    message: "minLevel must be <= maxLevel",
  })
  .refine(
    ({ memberItemIds }) => new Set(memberItemIds).size === memberItemIds.length,
    { message: "memberItemIds must not contain duplicates" },
  )
  .refine(
    ({ stages, memberItemIds }) =>
      stages.every((s) => s.requiredPieces <= memberItemIds.length),
    {
      message:
        "stage requiredPieces must not exceed the number of set members (a 6-piece bonus on a 4-piece set is unreachable)",
    },
  )
  .refine(
    ({ stages }) => {
      // Stage requiredPieces must be strictly monotonically increasing.
      for (let i = 0; i < stages.length - 1; i += 1) {
        if (stages[i].requiredPieces >= stages[i + 1].requiredPieces) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "stage requiredPieces must be strictly increasing (no ties, authored in order)",
    },
  )
  .refine(
    ({ stages }) => {
      // Triggered-effect ids must be globally unique across the *entire*
      // set — the combat event bus uses these ids as handles.
      const allIds: string[] = [];
      for (const s of stages) {
        for (const e of s.triggeredEffects) allIds.push(e.id);
      }
      return new Set(allIds).size === allIds.length;
    },
    {
      message:
        "triggered-effect ids must be unique across all stages of the set (combat event bus uses them as handles)",
    },
  );
export type ItemSet = z.infer<typeof ItemSetSchema>;

export const ItemSetsManifestSchema = z
  .array(ItemSetSchema)
  .refine((arr) => new Set(arr.map((s) => s.id)).size === arr.length, {
    message: "item-set ids must be unique",
  });
export type ItemSetsManifest = z.infer<typeof ItemSetsManifestSchema>;
