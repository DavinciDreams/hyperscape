/**
 * Housing manifest schema.
 *
 * Authored registry + policy for player housing — instanced or open-
 * world plots players can purchase, decorate, and invite visitors to.
 * Covers the plot-type catalog (sizes/tiers with their own slot caps
 * and upkeep), plus four global rule blocks (customization,
 * permissions, upkeep, visitors).
 *
 * Scope: authored policy. Runtime `HousingSystem` owns per-player plot
 * ownership state, decoration placement transforms, visitor session
 * tracking, upkeep timers + reclaim, permission enforcement, and the
 * housing UI — all separate follow-ups.
 *
 * Scope-isolated from `prefab.ts` (reusable decoration templates),
 * `economy-tuning.ts` (currency caps and auction fees), and
 * `factions.ts` (faction-gated plot purchase runs through permission
 * refs, not housing itself).
 */

import { z } from "zod";

/** HousingPlotTypeId — lowerCamelCase ASCII identifier. */
const HousingPlotTypeId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "housing plot-type id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/**
 * Plot category — drives UI grouping + default permissions.
 * `apartment` = instanced, shared-hallway buildings (cheap entry tier).
 * `cottage|manor|estate` = standalone instanced plots of increasing size.
 * `openWorld` = real open-world land (non-instanced, scarcity-gated).
 * `guildHall` = guild-owned shared space, permissions tied to the guild.
 */
export const HousingPlotCategorySchema = z.enum([
  "apartment",
  "cottage",
  "manor",
  "estate",
  "openWorld",
  "guildHall",
]);
export type HousingPlotCategory = z.infer<typeof HousingPlotCategorySchema>;

/**
 * Permission tier — who can do what on a plot.
 * `owner` = the titled owner; `coOwner` = delegated full-edit;
 * `friend` = can enter, cannot decorate; `guild` = guildmates;
 * `public` = anyone; `blocked` = explicit deny overriding any other
 * membership they may have.
 */
export const HousingPermissionTierSchema = z.enum([
  "owner",
  "coOwner",
  "friend",
  "guild",
  "public",
  "blocked",
]);
export type HousingPermissionTier = z.infer<typeof HousingPermissionTierSchema>;

/**
 * Decoration slot counts — "how many of each kind can I place?"
 * Interior + exterior are tracked separately since exterior decoration
 * is the public-facing version of the plot.
 */
export const HousingSlotCapsSchema = z
  .object({
    interior: z.number().int().min(0).max(10_000),
    exterior: z.number().int().min(0).max(10_000),
    /**
     * Items from `lighting-bake.ts` light probes — capped low since
     * each light is a runtime cost.
     */
    lighting: z.number().int().min(0).max(200).default(20),
    /**
     * Custom-media slots (player-uploaded images). 0 = disabled — many
     * games ban user-uploaded media at the housing level for moderation.
     */
    customMedia: z.number().int().min(0).max(100).default(0),
  })
  .strict();
export type HousingSlotCaps = z.infer<typeof HousingSlotCapsSchema>;

/**
 * Plot type entry — one row per catalog size/tier.
 */
export const HousingPlotTypeSchema = z
  .object({
    id: HousingPlotTypeId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    category: HousingPlotCategorySchema,
    /**
     * Physical plot size (meters). Used by the renderer to scale the
     * visible lot and the decoration volume.
     */
    widthMeters: z.number().min(1).max(500),
    depthMeters: z.number().min(1).max(500),
    heightMeters: z.number().min(1).max(200).default(20),
    slots: HousingSlotCapsSchema,
    /** Max simultaneous visitors (including owner). */
    visitorCap: z.number().int().min(1).max(200).default(20),
    /** Purchase cost in the specified currency. */
    purchaseCost: z.number().int().min(0).max(1_000_000_000).default(0),
    /** Currency id (shape-only ManifestRef). */
    purchaseCurrencyId: ManifestRef.default("gold"),
    /** Upkeep cost charged per upkeep cycle. 0 = free. */
    upkeepCost: z.number().int().min(0).max(1_000_000_000).default(0),
    /** Minimum character level to purchase. */
    minCharacterLevel: z.number().int().min(1).max(100).default(1),
    /**
     * If true, ownership can be transferred to another character
     * (gift / resell). Usually true for standalone plots, false for
     * apartments (since apartment units are effectively fungible).
     */
    transferable: z.boolean().default(true),
    /**
     * If true, this plot is instanced (each owner sees their own copy
     * in the same world slot). If false, it's a unique open-world lot
     * (scarcity-gated).
     */
    instanced: z.boolean().default(true),
  })
  .strict();
export type HousingPlotType = z.infer<typeof HousingPlotTypeSchema>;

/**
 * Customization rules — what decoration actions players can take.
 */
export const HousingCustomizationRulesSchema = z
  .object({
    allowDecoration: z.boolean().default(true),
    /**
     * If true, floor/wall/ceiling skins can be swapped (like Sims / FF14).
     */
    allowStructuralSkins: z.boolean().default(true),
    /**
     * If true, players can resize/move interior walls (the FF14
     * "partition" system). Usually gated to manor+ tiers.
     */
    allowStructuralEdits: z.boolean().default(false),
    /** If true, decorations can pass through each other (snap rules off). */
    allowDecorationClipping: z.boolean().default(false),
    /** Maximum decoration stack height (prevents sky-sculpture exploits). */
    maxStackHeightMeters: z.number().min(0.5).max(100).default(10),
    /**
     * Max continuous editing session before the system forces a save
     * (prevents unbounded undo-buffer growth). 0 = no cap.
     */
    maxSessionMinutes: z.number().int().min(0).max(480).default(120),
  })
  .strict();
export type HousingCustomizationRules = z.infer<
  typeof HousingCustomizationRulesSchema
>;

/**
 * Permission rules — how access lists work.
 */
export const HousingPermissionRulesSchema = z
  .object({
    /** Max co-owners per plot. 0 = solo-only. */
    maxCoOwners: z.number().int().min(0).max(10).default(1),
    /** Max explicit friend entries on the access list. */
    maxFriendEntries: z.number().int().min(0).max(500).default(100),
    /** Max explicit block entries on the access list. */
    maxBlockEntries: z.number().int().min(0).max(500).default(50),
    /**
     * If true, public plots appear in a browsable directory (FF14
     * housing ward pattern). If false, visitors must know the owner.
     */
    allowPublicListing: z.boolean().default(true),
    /**
     * If true, owners can add a "plot bio" and tags that surface in
     * the public directory.
     */
    allowPublicBio: z.boolean().default(true),
    /**
     * If true, a plot marked `public` auto-opens doors for visitors;
     * if false, visitors must still request entry via the door interact.
     */
    publicPlotsAutoOpenDoors: z.boolean().default(true),
  })
  .strict();
export type HousingPermissionRules = z.infer<
  typeof HousingPermissionRulesSchema
>;

/**
 * Upkeep rules — the "pay rent or lose the plot" policy.
 */
export const HousingUpkeepRulesSchema = z
  .object({
    /**
     * Days between upkeep charges. 0 = no upkeep (lifetime ownership).
     */
    cyclePeriodDays: z.number().int().min(0).max(365).default(7),
    /**
     * Grace period in days after a missed cycle. The plot is still
     * visitable during grace, but marked "at risk".
     */
    gracePeriodDays: z.number().int().min(0).max(90).default(14),
    /**
     * Days after grace before the plot is reclaimed by the system
     * (decorations returned to the owner's mailbox, plot relisted).
     * Must be >= gracePeriodDays + 1 (enforced by refinement).
     */
    reclaimAfterDays: z.number().int().min(1).max(180).default(30),
    /**
     * If true, unclaimed decorations are mailed back via `mail.ts`.
     * If false, they're destroyed (harsh but simpler).
     */
    returnDecorationsOnReclaim: z.boolean().default(true),
    /**
     * If true, players are messaged `upkeepWarningDaysAhead` days
     * before each upkeep charge.
     */
    sendUpkeepWarnings: z.boolean().default(true),
    upkeepWarningDaysAhead: z.number().int().min(0).max(30).default(3),
  })
  .strict()
  .refine(
    ({ reclaimAfterDays, gracePeriodDays }) =>
      reclaimAfterDays > gracePeriodDays,
    {
      message:
        "reclaimAfterDays must be greater than gracePeriodDays (reclaim happens after grace)",
    },
  );
export type HousingUpkeepRules = z.infer<typeof HousingUpkeepRulesSchema>;

/**
 * Visitor rules — how guests are handled.
 */
export const HousingVisitorRulesSchema = z
  .object({
    /**
     * If true, visitors can interact with owner-placed furniture
     * (sit, open, drawer). If false, all furniture is display-only.
     */
    visitorsCanInteract: z.boolean().default(true),
    /** If true, visitors can leave a guestbook entry. */
    allowGuestbook: z.boolean().default(true),
    /** Max guestbook entries retained per plot. */
    maxGuestbookEntries: z.number().int().min(0).max(1000).default(200),
    /**
     * Combat inside a plot: `allow` is RP/PvP-realm default; `block`
     * is safe-zone; `ownerChoice` lets the owner toggle via settings.
     */
    combatPolicy: z.enum(["allow", "block", "ownerChoice"]).default("block"),
  })
  .strict();
export type HousingVisitorRules = z.infer<typeof HousingVisitorRulesSchema>;

export const HousingManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Max plots a single character can own. */
    maxPlotsPerCharacter: z.number().int().min(0).max(50).default(1),
    /** Max plots a single account can own (across characters). */
    maxPlotsPerAccount: z.number().int().min(0).max(200).default(3),
    plotTypes: z.array(HousingPlotTypeSchema).default([]),
    customization: HousingCustomizationRulesSchema.default(() =>
      HousingCustomizationRulesSchema.parse({}),
    ),
    permissions: HousingPermissionRulesSchema.default(() =>
      HousingPermissionRulesSchema.parse({}),
    ),
    upkeep: HousingUpkeepRulesSchema.default(() =>
      HousingUpkeepRulesSchema.parse({}),
    ),
    visitors: HousingVisitorRulesSchema.default(() =>
      HousingVisitorRulesSchema.parse({}),
    ),
  })
  .strict()
  .refine(
    ({ plotTypes }) =>
      new Set(plotTypes.map((p) => p.id)).size === plotTypes.length,
    { message: "plotType ids must be unique" },
  )
  .refine(
    ({ maxPlotsPerCharacter, maxPlotsPerAccount }) =>
      maxPlotsPerAccount >= maxPlotsPerCharacter,
    {
      message:
        "maxPlotsPerAccount must be >= maxPlotsPerCharacter (account is a superset of a single character)",
    },
  )
  .refine(({ enabled, plotTypes }) => !enabled || plotTypes.length > 0, {
    message:
      "housing enabled=true requires at least one plotType (use enabled=false to disable)",
  });
export type HousingManifest = z.infer<typeof HousingManifestSchema>;
