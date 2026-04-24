/**
 * Transmog manifest schema.
 *
 * Authored policy + appearance registry for cosmetic equipment
 * overrides — the "my stats come from this item, but my character
 * looks like it's wearing that item" pattern (WoW Transmog / FF14
 * Glamour / Guild Wars 2 Wardrobe). Covers global rules (unlock
 * model, per-slot opt-outs, dye support), the appearance source
 * registry (items/sets that grant wardrobe entries on first equip
 * or via vendor), and outfit-save policies.
 *
 * Scope: authored policy + registry. Runtime `TransmogSystem` owns
 * per-character unlocked-appearance set, per-slot applied-appearance
 * state, outfit persistence, transmog apply + cost settlement, and
 * the wardrobe UI — all separate follow-ups.
 *
 * Scope-isolated from `equipment.ts` (item definitions — transmog
 * only references ids), `enchantments.ts` (stat overrides — transmog
 * never touches stats), and `item-sets.ts` (set-bonus mechanics — a
 * transmog source can match a set for display purposes only, never
 * grants stat bonuses).
 */

import { z } from "zod";

/** TransmogSourceId — lowerCamelCase ASCII identifier. */
const TransmogSourceId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "transmog source id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/**
 * Equipment slot — what body location an appearance overrides.
 * Matches `enchantments.ts` slot vocabulary + `outfit` for full-body
 * transmog presets that span multiple slots.
 */
export const TransmogSlotSchema = z.enum([
  "helm",
  "chest",
  "legs",
  "feet",
  "hands",
  "shoulders",
  "back",
  "mainHand",
  "offHand",
  "ranged",
]);
export type TransmogSlot = z.infer<typeof TransmogSlotSchema>;

/**
 * Unlock model — how an appearance becomes available to a character.
 */
export const TransmogUnlockModelSchema = z.enum([
  "onFirstEquip",
  "onFirstAcquire",
  "vendorPurchase",
  "questReward",
  "collectionEvent",
  "manual",
]);
export type TransmogUnlockModel = z.infer<typeof TransmogUnlockModelSchema>;

/**
 * Unlock scope — whether an unlock is per-character or account-wide.
 */
export const TransmogUnlockScopeSchema = z.enum(["perCharacter", "perAccount"]);
export type TransmogUnlockScope = z.infer<typeof TransmogUnlockScopeSchema>;

/**
 * Race/class gating — `all` wildcard or a list of specific ids
 * (shape-only). Empty list = impossible (refinement rejects).
 */
export const TransmogRestrictionSchema = z
  .object({
    raceAllowList: z
      .union([z.literal("all"), z.array(ManifestRef).min(1)])
      .default("all"),
    classAllowList: z
      .union([z.literal("all"), z.array(ManifestRef).min(1)])
      .default("all"),
    factionAllowList: z
      .union([z.literal("all"), z.array(ManifestRef).min(1)])
      .default("all"),
  })
  .strict();
export type TransmogRestriction = z.infer<typeof TransmogRestrictionSchema>;

/**
 * Transmog source — one row per appearance the wardrobe can track.
 * A source is typically an item id, but may also be a "set of N items
 * unified under one outfit entry" for full-body presets.
 */
export const TransmogSourceSchema = z
  .object({
    id: TransmogSourceId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    slot: TransmogSlotSchema,
    /**
     * Item id this source is derived from (shape-only). If empty, the
     * source is vendor-only (no item drop underpins it — common for
     * cosmetic-only shop skins).
     */
    itemId: z.string().default(""),
    /**
     * Display asset id — the renderable appearance (mesh/material).
     * Loader resolves against the rendering system.
     */
    displayAssetId: ManifestRef,
    unlockModel: TransmogUnlockModelSchema.default("onFirstAcquire"),
    unlockScope: TransmogUnlockScopeSchema.default("perAccount"),
    /** UI color tag (#rrggbb). Empty = renderer picks. */
    color: z
      .string()
      .regex(/^(#[0-9a-fA-F]{6})?$/, "color must be `#rrggbb` or empty string")
      .default(""),
    /** Rarity display tier (matches `titles.ts` rarity vocabulary). */
    rarity: z
      .enum(["", "common", "uncommon", "rare", "epic", "legendary", "mythic"])
      .default(""),
    restriction: TransmogRestrictionSchema.default(() =>
      TransmogRestrictionSchema.parse({}),
    ),
    /**
     * Vendor purchase cost (currency units). Relevant when
     * `unlockModel='vendorPurchase'`. 0 = free (other unlock models
     * ignore this).
     */
    vendorCost: z.number().int().min(0).max(1_000_000_000).default(0),
    vendorCurrencyId: ManifestRef.default("gold"),
    /** Set tag for "matches other slot pieces" UI grouping. Empty = unset. */
    setTag: z.string().default(""),
  })
  .strict()
  .refine(
    ({ unlockModel, vendorCost }) =>
      unlockModel !== "vendorPurchase" || vendorCost > 0,
    {
      message:
        "unlockModel='vendorPurchase' requires vendorCost > 0 (a free vendor source should use unlockModel='onFirstAcquire')",
    },
  )
  .refine(
    ({ unlockModel, itemId }) =>
      (unlockModel !== "onFirstEquip" && unlockModel !== "onFirstAcquire") ||
      itemId !== "",
    {
      message:
        "unlockModel='onFirstEquip'|'onFirstAcquire' requires itemId (cannot trigger on an item that doesn't exist)",
    },
  );
export type TransmogSource = z.infer<typeof TransmogSourceSchema>;

/**
 * Global transmog rules.
 */
export const TransmogGlobalRulesSchema = z
  .object({
    /** If true, transmog is available at all. */
    enabled: z.boolean().default(true),
    /** Slots that may NOT be transmogged (game-wide opt-out, e.g. legendary weapons). */
    lockedSlots: z.array(TransmogSlotSchema).default([]),
    /**
     * If true, appearance unlocks are shared account-wide by default.
     * Per-source `unlockScope` overrides this.
     */
    accountWideByDefault: z.boolean().default(true),
    /** Apply cost (currency units) per slot per apply. 0 = free apply. */
    applyCostPerSlotCurrency: z
      .number()
      .int()
      .min(0)
      .max(1_000_000_000)
      .default(500),
    applyCostCurrencyId: ManifestRef.default("gold"),
    /**
     * If true, original item must be in inventory/bank at apply time
     * (source-gated apply, the FF14 glamour-dresser pattern). If false,
     * any unlocked appearance can be applied without possessing the
     * original (WoW Transmog post-Legion pattern).
     */
    requireSourceInInventory: z.boolean().default(false),
    /** If true, appearance hiding (empty-slot look) is allowed. */
    allowHideSlot: z.boolean().default(true),
    /**
     * If true, dyeing the current appearance is enabled via a separate
     * dye item/currency. Dyes themselves are runtime data.
     */
    allowDye: z.boolean().default(true),
  })
  .strict()
  .refine(
    ({ lockedSlots }) => new Set(lockedSlots).size === lockedSlots.length,
    { message: "lockedSlots must not contain duplicates" },
  );
export type TransmogGlobalRules = z.infer<typeof TransmogGlobalRulesSchema>;

/**
 * Outfit rules — saved full-body presets.
 */
export const TransmogOutfitRulesSchema = z
  .object({
    /** If true, player-saved outfits are supported. */
    enabled: z.boolean().default(true),
    /** Max saved outfits per character. 0 disabled (requires enabled=false). */
    maxOutfitsPerCharacter: z.number().int().min(0).max(200).default(20),
    /** Max length of user-supplied outfit names. */
    maxOutfitNameLength: z.number().int().min(1).max(60).default(24),
    /**
     * If true, outfits may be shared to party members via a UI code
     * (similar to `loadouts.ts` sharing).
     */
    allowOutfitSharing: z.boolean().default(true),
  })
  .strict()
  .refine(
    ({ enabled, maxOutfitsPerCharacter }) =>
      !enabled || maxOutfitsPerCharacter > 0,
    {
      message:
        "outfits enabled=true requires maxOutfitsPerCharacter > 0 (use enabled=false to disable)",
    },
  );
export type TransmogOutfitRules = z.infer<typeof TransmogOutfitRulesSchema>;

export const TransmogManifestSchema = z
  .object({
    global: TransmogGlobalRulesSchema.default(() =>
      TransmogGlobalRulesSchema.parse({}),
    ),
    outfits: TransmogOutfitRulesSchema.default(() =>
      TransmogOutfitRulesSchema.parse({}),
    ),
    sources: z.array(TransmogSourceSchema).default([]),
  })
  .strict()
  .refine(
    ({ sources }) => new Set(sources.map((s) => s.id)).size === sources.length,
    { message: "transmog source ids must be unique" },
  );
export type TransmogManifest = z.infer<typeof TransmogManifestSchema>;
