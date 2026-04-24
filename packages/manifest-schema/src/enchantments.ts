/**
 * Enchantments manifest schema.
 *
 * Authored registry of item enchantments, gem sockets, and rune words —
 * the modifier layer that sits on top of base equipment. Each entry
 * describes a single enchantment: the slots it can apply to, the tier
 * ladder it scales with, the stat deltas it grants, and the crafting
 * recipe that applies it.
 *
 * Scope: authored registry. Runtime `EnchantmentSystem` stores enchant
 * instances on item instances, resolves stacked modifiers at equip,
 * handles gem socketing + extraction, and drives the UI for enchant
 * previews — all separate follow-ups.
 *
 * Scope-isolated from `equipment.ts` (base items), `recipes.ts` (generic
 * crafting outputs), `status-effects.ts` (transient buffs/debuffs —
 * enchantments are permanent item modifiers).
 */

import { z } from "zod";

/** EnchantmentId — lowerCamelCase ASCII identifier. */
const EnchantmentId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "enchantment id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/**
 * Enchantment kind — drives UI grouping, inventory slot interaction,
 * and whether the enchant consumes a socket.
 */
export const EnchantmentKindSchema = z.enum([
  /** Permanently bound to the item via an enchanter's table. */
  "permanent",
  /** Slotted into a socket; can be extracted (possibly destructively). */
  "socket-gem",
  /** Rune word — applied by inserting a sequence of runes. */
  "rune-word",
  /** Temporary enchant (scroll/oil); wears off after N hits/hours. */
  "temporary",
]);
export type EnchantmentKind = z.infer<typeof EnchantmentKindSchema>;

/**
 * Equipment slot an enchant can apply to. Broader than
 * `pet-companion`'s slot list because enchants target player gear,
 * not pet gear.
 */
export const EnchantmentSlotSchema = z.enum([
  "weapon",
  "offhand",
  "helmet",
  "chest",
  "legs",
  "boots",
  "gloves",
  "cape",
  "ring",
  "amulet",
  "any",
]);
export type EnchantmentSlot = z.infer<typeof EnchantmentSlotSchema>;

/**
 * Modifier stat an enchant can affect. Same vocabulary as
 * `status-effects.ts` so runtime stat aggregation code can use a
 * shared resolver.
 */
export const EnchantmentStatSchema = z.enum([
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
export type EnchantmentStat = z.infer<typeof EnchantmentStatSchema>;

export const EnchantmentOpSchema = z.enum(["add", "multiply"]);
export type EnchantmentOp = z.infer<typeof EnchantmentOpSchema>;

/**
 * Single stat delta at a specific tier. `tier` is 1..10 (matches the
 * common MMO "rank" ladder). `value` is the effective delta at that
 * tier; authors list each tier explicitly so the ladder can be
 * non-linear.
 */
export const EnchantmentTierEntrySchema = z
  .object({
    tier: z.number().int().min(1).max(10),
    value: z.number(),
    /** Required character level to apply this tier. */
    requiredLevel: z.number().int().min(1).max(100).default(1),
  })
  .strict();
export type EnchantmentTierEntry = z.infer<typeof EnchantmentTierEntrySchema>;

/**
 * Stat-modifier bundle on an enchantment. An enchant may grant one or
 * many deltas; each has its own tier ladder.
 */
export const EnchantmentModifierSchema = z
  .object({
    stat: EnchantmentStatSchema,
    op: EnchantmentOpSchema,
    /** Tier ladder — must contain ≥1 entry. Tier numbers must be unique. */
    tiers: z.array(EnchantmentTierEntrySchema).min(1),
  })
  .strict()
  .refine(
    ({ tiers }) => new Set(tiers.map((t) => t.tier)).size === tiers.length,
    { message: "tier numbers must be unique within a modifier" },
  )
  .refine(
    ({ op, tiers }) =>
      op === "multiply" ? tiers.every((t) => t.value > 0) : true,
    {
      message:
        "`multiply` modifier tier values must all be > 0 (use `add` with negative for debuffs)",
    },
  );
export type EnchantmentModifier = z.infer<typeof EnchantmentModifierSchema>;

/**
 * Crafting recipe that applies this enchantment. Shape-only
 * references; loader resolves against `recipes.ts` / `items.ts`.
 * Empty recipe = enchantment is not player-craftable (e.g. drop-only).
 */
export const EnchantmentRecipeSchema = z
  .object({
    /** Item ids of reagents consumed. */
    reagentIds: z.array(ManifestRef).default([]),
    /** Required crafting station id (resolved against `stations.ts`). */
    stationId: z.string().default(""),
    /** Minimum crafting skill level. */
    requiredCraftingLevel: z.number().int().min(0).max(100).default(0),
    /** Success chance at minimum level (1.0 = 100% at required level). */
    successChance: z.number().min(0).max(1).default(1),
  })
  .strict();
export type EnchantmentRecipe = z.infer<typeof EnchantmentRecipeSchema>;

export const EnchantmentSchema = z
  .object({
    id: EnchantmentId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    kind: EnchantmentKindSchema,
    /**
     * Slots this enchant can apply to. `["any"]` = applies to any
     * slot; otherwise an explicit list. Duplicates rejected.
     */
    slots: z.array(EnchantmentSlotSchema).min(1),
    /** Max tier attainable (1..10). Per-modifier `tiers[]` must not exceed. */
    maxTier: z.number().int().min(1).max(10).default(1),
    modifiers: z.array(EnchantmentModifierSchema).min(1),
    recipe: EnchantmentRecipeSchema.default(() =>
      EnchantmentRecipeSchema.parse({}),
    ),
    /**
     * Only for `temporary` kind — number of hits/ticks before the
     * enchant wears off. 0 = not-temporary (rejected if kind=temporary).
     */
    durationHits: z.number().int().min(0).max(10_000).default(0),
    /** If true, removing the enchant destroys the item. */
    destructiveRemoval: z.boolean().default(false),
    /** If true, the enchant is soul-bound (non-tradeable item once applied). */
    soulboundsItem: z.boolean().default(false),
  })
  .strict()
  .refine(({ slots }) => new Set(slots).size === slots.length, {
    message: "enchantment slot list must not repeat a slot",
  })
  .refine(
    ({ slots }) => {
      // `any` cannot coexist with any specific slot.
      if (slots.includes("any") && slots.length > 1) return false;
      return true;
    },
    {
      message:
        "`any` slot cannot be combined with specific slots — use one or the other",
    },
  )
  .refine(
    ({ maxTier, modifiers }) =>
      modifiers.every((m) => m.tiers.every((t) => t.tier <= maxTier)),
    {
      message: "modifier tier entry must not exceed enchantment.maxTier",
    },
  )
  .refine(
    ({ kind, durationHits }) =>
      kind === "temporary" ? durationHits > 0 : durationHits === 0,
    {
      message:
        "`temporary` enchantments require `durationHits > 0`; non-temporary must leave it 0",
    },
  );
export type Enchantment = z.infer<typeof EnchantmentSchema>;

/**
 * Manifest is a bare array of enchantments with a unique-id refinement.
 */
export const EnchantmentsManifestSchema = z
  .array(EnchantmentSchema)
  .refine((arr) => new Set(arr.map((e) => e.id)).size === arr.length, {
    message: "enchantment ids must be unique",
  });
export type EnchantmentsManifest = z.infer<typeof EnchantmentsManifestSchema>;
