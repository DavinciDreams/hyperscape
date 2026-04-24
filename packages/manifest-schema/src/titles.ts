/**
 * Titles manifest schema.
 *
 * Authored registry of player honorific titles — "Champion of the
 * Eclipse", "Dragonslayer", "Bane of Goblins", "<Name> the Valiant".
 * Each entry declares the display template (prefix/suffix/replace),
 * the unlock conditions that grant the title (achievement chain, boss
 * kill, leaderboard bracket, quest completion, purchase), the display
 * rarity tier, and any expiration/revocation rules.
 *
 * Scope: authored registry. Runtime `TitleSystem` owns per-player title
 * ownership, active title selection, unlock condition evaluation,
 * revocation on rule violation, and the nameplate renderer — all
 * separate follow-ups.
 *
 * Scope-isolated from `achievements.ts` (achievements are personal
 * milestone flags that *may* grant titles as rewards, but titles stand
 * on their own) and `leaderboards.ts` (leaderboards grant titles as
 * cadence-rollover rewards, references are shape-only).
 */

import { z } from "zod";

/** TitleId — lowerCamelCase ASCII identifier. */
const TitleId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "title id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/**
 * Display mode — where the title appears relative to the player name.
 * `prefix` = "<Title> <Name>", `suffix` = "<Name> <Title>", `replace` =
 * title shown *instead* of name (rare; "Champion" ranks in some MMOs).
 */
export const TitleDisplayModeSchema = z.enum(["prefix", "suffix", "replace"]);
export type TitleDisplayMode = z.infer<typeof TitleDisplayModeSchema>;

/**
 * Rarity — drives UI color + sort priority in the title picker.
 */
export const TitleRaritySchema = z.enum([
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
]);
export type TitleRarity = z.infer<typeof TitleRaritySchema>;

/**
 * Unlock condition — discriminated union of how a player earns this title.
 * Runtime evaluates each condition against player state to decide grant.
 */
export const TitleUnlockConditionSchema = z.discriminatedUnion("kind", [
  /** Granted when a specific achievement is completed. */
  z
    .object({
      kind: z.literal("achievement"),
      achievementId: ManifestRef,
    })
    .strict(),
  /** Granted when a leaderboard reward bracket is awarded at cadence rollover. */
  z
    .object({
      kind: z.literal("leaderboardBracket"),
      leaderboardId: ManifestRef,
      bracketId: z
        .string()
        .regex(
          /^[a-z][a-zA-Z0-9_-]*$/,
          "bracket id must be lowerCamelCase ASCII identifier",
        ),
    })
    .strict(),
  /** Granted after N kills of a specific boss/NPC. */
  z
    .object({
      kind: z.literal("bossKillCount"),
      npcId: ManifestRef,
      requiredKills: z.number().int().min(1).max(1_000_000),
    })
    .strict(),
  /** Granted on quest completion. */
  z
    .object({
      kind: z.literal("quest"),
      questId: ManifestRef,
    })
    .strict(),
  /** Granted at a specific skill level threshold. */
  z
    .object({
      kind: z.literal("skillLevel"),
      skillId: ManifestRef,
      requiredLevel: z.number().int().min(1).max(100),
    })
    .strict(),
  /** Purchasable in-store (cosmetic/convenience). */
  z
    .object({
      kind: z.literal("purchase"),
      cost: z.number().int().min(1).max(1_000_000_000),
      currencyId: z
        .string()
        .regex(
          /^[a-z][a-zA-Z0-9_-]*$/,
          "currency id must be lowerCamelCase ASCII identifier",
        )
        .default("gold"),
    })
    .strict(),
  /** Manual-only — granted by GM / admin command or event reward. */
  z
    .object({
      kind: z.literal("manual"),
    })
    .strict(),
]);
export type TitleUnlockCondition = z.infer<typeof TitleUnlockConditionSchema>;

/**
 * Revocation rule — whether/when the title is removed. Most titles are
 * permanent once earned; some (seasonal, rank-based) expire when the
 * source cadence rolls over.
 */
export const TitleRevocationSchema = z
  .object({
    /** If true, title is removed when the source cadence rolls over. */
    revokeOnCadenceRollover: z.boolean().default(false),
    /**
     * If > 0, title expires N days after grant regardless of cadence.
     * 0 = never auto-expires.
     */
    expireAfterDays: z.number().int().min(0).max(3650).default(0),
    /**
     * If true, title is revocable by GM action. Most cosmetic titles
     * should be revocable (for ToS violations, e.g. offensive name).
     */
    revocableByGm: z.boolean().default(true),
  })
  .strict();
export type TitleRevocation = z.infer<typeof TitleRevocationSchema>;

export const TitleSchema = z
  .object({
    id: TitleId,
    /** Internal name for admin/editor UI. */
    name: z.string().min(1),
    /**
     * Localization key for the displayed title text (resolves against
     * `localization.ts`). Required — titles are always localized.
     */
    displayKey: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    displayMode: TitleDisplayModeSchema,
    rarity: TitleRaritySchema,
    /**
     * Color for the title text (#rrggbb). Empty = renderer picks based
     * on rarity (common=gray, legendary=gold, etc).
     */
    color: z
      .string()
      .regex(/^(#[0-9a-fA-F]{6})?$/, "color must be `#rrggbb` or empty string")
      .default(""),
    /**
     * Unlock conditions — satisfying ANY one grants the title (OR
     * semantics). Authors needing AND semantics should use an achievement
     * chain and reference the capstone achievement.
     */
    unlockConditions: z.array(TitleUnlockConditionSchema).min(1),
    /** Revocation rules. */
    revocation: TitleRevocationSchema.default(() =>
      TitleRevocationSchema.parse({}),
    ),
    /**
     * If true, title is hidden from the picker UI until earned (reveal-
     * on-unlock). Default true — mysteries drive engagement.
     */
    hiddenUntilEarned: z.boolean().default(true),
    /**
     * If true, title is shown in the player's achievements tab as a
     * notable accomplishment.
     */
    showInAchievementsTab: z.boolean().default(true),
  })
  .strict()
  .refine(
    ({ unlockConditions }) => {
      // Condition kinds should be unique within a title — two
      // "achievement" unlocks on the same title is redundant config.
      const kinds = unlockConditions.map((c) => c.kind);
      return new Set(kinds).size === kinds.length;
    },
    {
      message:
        "unlockConditions kinds must be unique — having two conditions of the same kind is redundant (merge them)",
    },
  );
export type Title = z.infer<typeof TitleSchema>;

export const TitlesManifestSchema = z
  .array(TitleSchema)
  .refine((arr) => new Set(arr.map((t) => t.id)).size === arr.length, {
    message: "title ids must be unique",
  });
export type TitlesManifest = z.infer<typeof TitlesManifestSchema>;
