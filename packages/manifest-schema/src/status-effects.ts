/**
 * Status-effects manifest schema.
 *
 * Authored registry of buffs/debuffs — poison, bleed, stun, haste,
 * shield, burning, rooted, etc. Each entry describes the effect's
 * shape (beneficial / harmful / neutral), its stat modifiers, its
 * tick behavior, its stacking rules, and the gameplay tags needed
 * for interactions with other systems (cleanse, purge, extend).
 *
 * Scope: authored registry. Runtime `StatusEffectSystem` applies
 * modifiers, ticks damage/heal, resolves stack math, fires cleanse
 * events — all separate follow-ups.
 *
 * Deliberately narrower than `combat.ts` (weapon/damage math) and
 * `prayers.ts` (channeled player-controlled effects). Status effects
 * are externally-applied transient modifiers with a well-defined
 * lifetime.
 */

import { z } from "zod";

/** StatusEffectId — lowerCamelCase ASCII identifier. */
const StatusEffectId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "status effect id must be lowerCamelCase ASCII identifier",
  );

/** Gameplay tag — lowerCamelCase segment (used for cleanse/purge filters). */
const GameplayTag = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "gameplay tag must be lowerCamelCase ASCII identifier",
  );

/** A stat the effect can modify. Narrow enum so typos surface at load. */
export const StatusEffectStatSchema = z.enum([
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
]);
export type StatusEffectStat = z.infer<typeof StatusEffectStatSchema>;

/**
 * Category — coarse classification driving cleanse/UI affordances.
 * `beneficial` = buff (green frame), `harmful` = debuff (red frame),
 * `neutral` = meta marker (invisible, often pure tag carrier).
 */
export const StatusEffectCategorySchema = z.enum([
  "beneficial",
  "harmful",
  "neutral",
]);
export type StatusEffectCategory = z.infer<typeof StatusEffectCategorySchema>;

/** How the effect's stat modifier applies. */
export const StatusEffectModifierOpSchema = z.enum([
  "add",
  "multiply",
  "override",
]);
export type StatusEffectModifierOp = z.infer<
  typeof StatusEffectModifierOpSchema
>;

/**
 * Stat modifier entry. `add` = flat addend; `multiply` = scalar
 * applied after all adds (so 1.10 = +10%); `override` = replace
 * stat with `value` while active.
 */
export const StatusEffectModifierSchema = z
  .object({
    stat: StatusEffectStatSchema,
    op: StatusEffectModifierOpSchema,
    value: z.number(),
  })
  .strict()
  .refine(({ op, value }) => (op === "multiply" ? value > 0 : true), {
    message:
      "`multiply` modifier must have value > 0 (use 0 via `override` instead)",
  });
export type StatusEffectModifier = z.infer<typeof StatusEffectModifierSchema>;

/** How stacking is resolved when the same effect re-applies. */
export const StackRuleSchema = z.enum([
  /** New application replaces old duration + intensity (most common). */
  "refresh",
  /** Old application keeps ticking; new is dropped. */
  "reject",
  /** Old + new coexist, each with its own timer (array of instances). */
  "independent",
  /** Count goes up; single timer tracks the longest remaining. */
  "stack-count",
]);
export type StackRule = z.infer<typeof StackRuleSchema>;

export const StatusEffectSchema = z
  .object({
    id: StatusEffectId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    category: StatusEffectCategorySchema,
    /** Gameplay tags — used by cleanses, purges, and immunity filters. */
    tags: z.array(GameplayTag).default([]),
    /** Stat modifiers applied while active. */
    modifiers: z.array(StatusEffectModifierSchema).default([]),
    /** Base duration in seconds. 0 = instant / one-tick (e.g. execute). */
    durationSec: z.number().min(0).max(3600),
    /**
     * Tick interval in seconds. 0 = no periodic tick (pure modifier
     * effect). Positive values fire `perTickDamage` / `perTickHeal`.
     */
    tickIntervalSec: z.number().min(0).max(60).default(0),
    /**
     * Damage dealt per tick (0 = none). Negative values are rejected —
     * for healing over time use `perTickHeal`.
     */
    perTickDamage: z.number().min(0).max(1_000_000).default(0),
    /** Healing applied per tick (0 = none). */
    perTickHeal: z.number().min(0).max(1_000_000).default(0),
    /** Damage type id for `perTickDamage`; resolved against damage-types.ts. */
    damageTypeId: StatusEffectId.default("true"),
    /** Stacking rule. */
    stackRule: StackRuleSchema.default("refresh"),
    /**
     * Max stack count for `stack-count` rule. Must be ≥ 1; meaningless
     * otherwise but kept as author hint. 1 = single instance.
     */
    maxStacks: z.number().int().min(1).max(99).default(1),
    /** If true the effect cannot be dispelled. */
    undispellable: z.boolean().default(false),
    /** If true the effect survives the owner's death. */
    persistOnDeath: z.boolean().default(false),
    /** Optional VFX id spawned on apply (see vfx.ts). */
    applyVfxId: z.string().default(""),
    /** Optional VFX id that loops while active. */
    activeVfxId: z.string().default(""),
    /** Optional SFX id on apply. */
    applySfxId: z.string().default(""),
  })
  .strict()
  .refine(
    ({ tickIntervalSec, perTickDamage, perTickHeal }) =>
      tickIntervalSec > 0 || (perTickDamage === 0 && perTickHeal === 0),
    {
      message:
        "`perTickDamage` and `perTickHeal` require `tickIntervalSec > 0`",
    },
  )
  .refine(
    ({ stackRule, maxStacks }) =>
      stackRule === "stack-count" ? maxStacks >= 2 : true,
    {
      message:
        "`stack-count` stack rule requires `maxStacks >= 2` (otherwise it's equivalent to `refresh`)",
    },
  );
export type StatusEffect = z.infer<typeof StatusEffectSchema>;

/**
 * Manifest is a bare array of effects with a unique-id refinement.
 */
export const StatusEffectsManifestSchema = z
  .array(StatusEffectSchema)
  .refine((arr) => new Set(arr.map((e) => e.id)).size === arr.length, {
    message: "status effect ids must be unique",
  });
export type StatusEffectsManifest = z.infer<typeof StatusEffectsManifestSchema>;
