/**
 * Loadouts manifest schema.
 *
 * Authored policy blob governing saved character loadouts — the
 * WoW Equipment Manager / Destiny 2 / POE saved-build pattern that
 * lets a player swap between prepared equipment + ability + consumable
 * configurations with one click.
 *
 * Scope: authored policy. Runtime `LoadoutSystem` owns per-character
 * persisted loadout slots, the swap-apply engine (moving items between
 * bag and equipped slots atomically), swap-cooldown tracking, combat-
 * state guarding, and the loadout UI — all separate follow-ups.
 *
 * Scope-isolated from `equipment.ts` (item definitions), from
 * `combat-spells.ts` (ability definitions), and from `prayers.ts`
 * (prayer definitions). Loadouts reference these by shape-only id.
 */

import { z } from "zod";

/**
 * Which content categories a loadout may snapshot.
 * A game may opt in/out per category — a classless MMO wouldn't
 * snapshot talents; a no-prayer game wouldn't snapshot prayers.
 */
export const LoadoutSlotCategorySchema = z.enum([
  "equipment",
  "consumables",
  "abilities",
  "prayers",
  "talents",
  "runes",
]);
export type LoadoutSlotCategory = z.infer<typeof LoadoutSlotCategorySchema>;

/**
 * Swap policy — when a loadout swap is allowed.
 */
export const LoadoutSwapPolicySchema = z.enum([
  "always",
  "outOfCombat",
  "safeZoneOnly",
]);
export type LoadoutSwapPolicy = z.infer<typeof LoadoutSwapPolicySchema>;

/**
 * Slot rules — what a single loadout can snapshot + how swaps apply.
 */
export const LoadoutSlotRulesSchema = z
  .object({
    /**
     * Subset of categories the loadout captures. Empty = no categories
     * (refinement below rejects this). Duplicates rejected.
     */
    categories: z.array(LoadoutSlotCategorySchema).min(1),
    /**
     * If true, swapping into this loadout replaces *all* items in the
     * captured categories. If false, the loadout is treated as a sparse
     * overlay — only items it explicitly lists are changed.
     */
    fullReplacement: z.boolean().default(true),
    /**
     * If true, the swap will pull items from bags (and bank if
     * `pullFromBank=true`). If false, a loadout whose items aren't
     * currently equipped or in the bag fails the swap.
     */
    pullFromBags: z.boolean().default(true),
    /**
     * If true, loadout swap may pull items from the bank. Usually
     * false — bank should be a deliberate deposit/withdraw action.
     */
    pullFromBank: z.boolean().default(false),
  })
  .strict()
  .refine(({ categories }) => new Set(categories).size === categories.length, {
    message: "categories must not contain duplicates",
  });
export type LoadoutSlotRules = z.infer<typeof LoadoutSlotRulesSchema>;

/**
 * Naming rules — visible to the player in the UI.
 */
export const LoadoutNamingRulesSchema = z
  .object({
    /** Max name length for a loadout. 0 = names disabled (slot number only). */
    maxNameLength: z.number().int().min(0).max(60).default(24),
    /**
     * If true, profanity filter applies to names (checked against the
     * system's chat filter at save time).
     */
    enforceProfanityFilter: z.boolean().default(true),
    /**
     * Max icon presets selectable per loadout — lets the player pick a
     * distinct UI glyph (sword, bow, staff, etc.). 0 = no icons.
     */
    iconPresetCount: z.number().int().min(0).max(200).default(24),
  })
  .strict();
export type LoadoutNamingRules = z.infer<typeof LoadoutNamingRulesSchema>;

/**
 * Swap rules — when + how loadout activation is allowed.
 */
export const LoadoutSwapRulesSchema = z
  .object({
    /**
     * When a swap is allowed. `always` = no state restriction (power
     * users / debug servers); `outOfCombat` = standard MMO rule; `safeZoneOnly`
     * = only in capital cities / inn rest areas (PoE idiom).
     */
    policy: LoadoutSwapPolicySchema.default("outOfCombat"),
    /**
     * Cooldown between swap completions (seconds). 0 = instant
     * repeat allowed. Prevents rapid-fire ability-cycling exploits.
     */
    cooldownSec: z.number().int().min(0).max(600).default(10),
    /**
     * If > 0, applying a swap takes this long (seconds of uninterrupted
     * channel, "sitting by the fire" animation). 0 = instant swap.
     */
    channelTimeSec: z.number().min(0).max(60).default(0),
    /**
     * If true, taking damage during `channelTimeSec` cancels the swap.
     * Must be false when `channelTimeSec = 0` (no channel to cancel).
     */
    cancelChannelOnDamage: z.boolean().default(false),
    /**
     * If true, on death the character respawns with the last-applied
     * loadout (vs. whatever was equipped at time of death).
     */
    autoRestoreOnRespawn: z.boolean().default(false),
  })
  .strict()
  .refine(
    ({ channelTimeSec, cancelChannelOnDamage }) =>
      channelTimeSec > 0 || !cancelChannelOnDamage,
    {
      message:
        "cancelChannelOnDamage has no effect when channelTimeSec=0 (either set channelTimeSec > 0 or cancelChannelOnDamage=false)",
    },
  );
export type LoadoutSwapRules = z.infer<typeof LoadoutSwapRulesSchema>;

/**
 * Sharing rules — can a loadout configuration be exported?
 */
export const LoadoutSharingRulesSchema = z
  .object({
    /**
     * If true, a loadout can be exported as a string code (paste-able
     * to friends). Standard in POE / D4 build-sharing sites.
     */
    allowExport: z.boolean().default(true),
    /**
     * If true, a loadout can be imported from a code. Disabling this
     * while allowing export is the "read-only share" mode — friends
     * can view but not materialize.
     */
    allowImport: z.boolean().default(true),
    /**
     * If true, loadouts can be shared directly to party members via
     * a UI button (like WoW's "share build" link). Requires both
     * allowExport+allowImport.
     */
    allowPartyShare: z.boolean().default(false),
  })
  .strict()
  .refine(
    ({ allowPartyShare, allowExport, allowImport }) =>
      !allowPartyShare || (allowExport && allowImport),
    {
      message:
        "allowPartyShare requires both allowExport and allowImport (sharing is a paste operation)",
    },
  );
export type LoadoutSharingRules = z.infer<typeof LoadoutSharingRulesSchema>;

/**
 * Loadouts is a single policy blob per game, not a registry.
 */
export const LoadoutsManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    /**
     * Max loadout slots a single character may save. 0 = loadouts
     * disabled (matches `enabled=false`, but allowed for runtime
     * per-account tier overrides).
     */
    maxSlotsPerCharacter: z.number().int().min(0).max(50).default(10),
    /**
     * If > 0, loadout slots beyond this index are paid (premium
     * unlock / in-game currency unlock). 0 = all slots free.
     */
    freeSlotCount: z.number().int().min(0).max(50).default(3),
    slot: LoadoutSlotRulesSchema.default(() =>
      LoadoutSlotRulesSchema.parse({ categories: ["equipment", "abilities"] }),
    ),
    naming: LoadoutNamingRulesSchema.default(() =>
      LoadoutNamingRulesSchema.parse({}),
    ),
    swap: LoadoutSwapRulesSchema.default(() =>
      LoadoutSwapRulesSchema.parse({}),
    ),
    sharing: LoadoutSharingRulesSchema.default(() =>
      LoadoutSharingRulesSchema.parse({}),
    ),
  })
  .strict()
  .refine(
    ({ freeSlotCount, maxSlotsPerCharacter }) =>
      freeSlotCount <= maxSlotsPerCharacter,
    {
      message:
        "freeSlotCount must be <= maxSlotsPerCharacter (can't give more free slots than slots exist)",
    },
  )
  .refine(
    ({ enabled, maxSlotsPerCharacter }) => !enabled || maxSlotsPerCharacter > 0,
    {
      message:
        "loadouts enabled=true requires maxSlotsPerCharacter > 0 (use enabled=false to disable)",
    },
  );
export type LoadoutsManifest = z.infer<typeof LoadoutsManifestSchema>;
