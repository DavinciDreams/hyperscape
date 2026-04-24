/**
 * News-feed manifest schema.
 *
 * Authored in-game announcements: patch notes, maintenance windows,
 * event teasers, hotfix notes, community updates. Each entry carries
 * publish/expire dates, targeting predicates, category/priority, and
 * a body asset reference (text/HTML kept out of the manifest to stay
 * commit-friendly). Runtime `NewsFeedSystem` owns fetch, caching,
 * read-receipt storage, and client-side feed UI.
 *
 * Scope-isolated from:
 *   - `analytics-events.ts` (opens/reads emit events but the event
 *     schema lives there)
 *   - `feature-flags.ts` (runtime toggles — news entries are content,
 *     not toggles)
 *   - `localization.ts` (news bodies point at localized asset refs,
 *     localization package owns the strings)
 *   - `world-events.ts` (in-world FATE-style events — totally separate
 *     from the news/announcements feed)
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/** NewsEntryId — lowerCamelCase. */
const NewsEntryId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "news entry id must be lowerCamelCase ASCII identifier",
  );

/** CategoryId — lowerCamelCase. */
const CategoryId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "category id must be lowerCamelCase ASCII identifier",
  );

/** Supported platforms for targeting. Mirrors feature-flags. */
export const NewsPlatformSchema = z.enum([
  "web",
  "windows",
  "macos",
  "linux",
  "ios",
  "android",
  "steam",
]);
export type NewsPlatform = z.infer<typeof NewsPlatformSchema>;

/** Priority band — higher shows first. */
export const NewsPrioritySchema = z.enum(["critical", "high", "normal", "low"]);
export type NewsPriority = z.infer<typeof NewsPrioritySchema>;

/**
 * Category — grouping + color for the feed UI.
 */
export const NewsCategorySchema = z
  .object({
    id: CategoryId,
    name: z.string().min(1),
    description: z.string().default(""),
    /** Hex color (optional empty string = use UI default). */
    color: z
      .string()
      .regex(
        /^(#[0-9a-fA-F]{6})?$/,
        "color must be empty string or #RRGGBB hex",
      )
      .default(""),
    /** Icon asset reference. */
    iconAssetRef: ManifestRef.optional(),
    /** Show category in the "filter by category" chip row. */
    visibleInFilters: z.boolean().default(true),
  })
  .strict();
export type NewsCategory = z.infer<typeof NewsCategorySchema>;

/**
 * Targeting predicate — all specified criteria must match.
 * Unset = wildcard.
 */
export const NewsTargetingSchema = z
  .object({
    platforms: z.array(NewsPlatformSchema).default([]),
    regionPrefixes: z.array(z.string().min(2).max(8)).default([]),
    /** Show to players whose client build is >= this string. */
    minClientBuild: z.string().default(""),
    /** Show to players whose character level >= this. 0 = no floor. */
    minCharacterLevel: z.number().int().min(0).max(200).default(0),
    /** Show only if player's account age >= days. 0 = no floor. */
    minAccountAgeDays: z.number().int().min(0).max(3650).default(0),
    /** Feature flag id required to be enabled (empty = no gate). */
    requiresFlagId: z.string().default(""),
  })
  .strict()
  .refine((t) => new Set(t.platforms).size === t.platforms.length, {
    message: "platforms must be unique",
    path: ["platforms"],
  })
  .refine((t) => new Set(t.regionPrefixes).size === t.regionPrefixes.length, {
    message: "regionPrefixes must be unique",
    path: ["regionPrefixes"],
  });
export type NewsTargeting = z.infer<typeof NewsTargetingSchema>;

/**
 * A single news entry — patch note, announcement, maintenance, etc.
 */
export const NewsEntrySchema = z
  .object({
    id: NewsEntryId,
    /** Title shown in feed list (localized via display key). */
    titleLocalizationKey: z.string().min(1),
    /** One-line summary shown under title. */
    summaryLocalizationKey: z.string().default(""),
    /** Full body (HTML or markdown) — referenced, never inlined. */
    bodyAssetRef: ManifestRef,
    categoryId: CategoryId,
    priority: NewsPrioritySchema.default("normal"),
    /** ISO-8601 UTC publish time — shown-and-targetable after this. */
    publishAtIso: z.string().min(1, "publishAtIso is required"),
    /** ISO-8601 UTC expiry time — hidden after this. Empty = never. */
    expireAtIso: z.string().default(""),
    /** Pin to top of feed regardless of publish date sort. */
    pinned: z.boolean().default(false),
    /** Mark as dismissable — user can clear from their feed. */
    dismissable: z.boolean().default(true),
    /** Count reads/opens for analytics. */
    trackReads: z.boolean().default(true),
    /** Show red-dot badge on first appearance. */
    showUnreadBadge: z.boolean().default(true),
    /** Hero image asset ref (optional). */
    heroImageAssetRef: ManifestRef.optional(),
    /** Optional deep-link action fired on "Read more" click. */
    deepLink: z.string().default(""),
    /** Targeting predicate. */
    targeting: NewsTargetingSchema.default(() => NewsTargetingSchema.parse({})),
    /** Tags for client-side filtering beyond category (free-form). */
    tags: z.array(z.string().min(1).max(40)).default([]),
  })
  .strict()
  .refine((e) => e.expireAtIso === "" || e.expireAtIso > e.publishAtIso, {
    message: "expireAtIso must be > publishAtIso (or empty)",
    path: ["expireAtIso"],
  })
  .refine((e) => new Set(e.tags).size === e.tags.length, {
    message: "tags must be unique",
    path: ["tags"],
  });
export type NewsEntry = z.infer<typeof NewsEntrySchema>;

/**
 * Feed-level rules.
 */
export const FeedRulesSchema = z
  .object({
    /** Max entries kept in the feed cache (oldest dropped). */
    maxEntriesRetained: z.number().int().min(10).max(1000).default(100),
    /** Refresh interval for client poll (minutes). 0 = push-only. */
    pollIntervalMinutes: z.number().int().min(0).max(1440).default(30),
    /** Show the news panel on login if any unread entries. */
    autoShowOnLoginIfUnread: z.boolean().default(true),
    /** Group entries by category in the UI. */
    groupByCategory: z.boolean().default(false),
    /** Respect user's "don't show me news" preference. */
    allowUserOptOut: z.boolean().default(true),
  })
  .strict();
export type FeedRules = z.infer<typeof FeedRulesSchema>;

/**
 * News-feed manifest — top-level authored document.
 */
export const NewsFeedManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    categories: z.array(NewsCategorySchema).default([]),
    entries: z.array(NewsEntrySchema).default([]),
    feed: FeedRulesSchema.default(() => FeedRulesSchema.parse({})),
  })
  .strict()
  .refine(
    (m) => new Set(m.categories.map((c) => c.id)).size === m.categories.length,
    { message: "category ids must be unique", path: ["categories"] },
  )
  .refine(
    (m) => new Set(m.entries.map((e) => e.id)).size === m.entries.length,
    { message: "entry ids must be unique", path: ["entries"] },
  )
  .refine(
    (m) => {
      const ids = new Set(m.categories.map((c) => c.id));
      return m.entries.every((e) => ids.has(e.categoryId));
    },
    {
      message: "all entry.categoryId must resolve to a declared category",
      path: ["entries"],
    },
  )
  .refine((m) => !m.enabled || m.categories.length >= 1, {
    message: "news-feed enabled=true requires at least one category",
    path: ["categories"],
  });
export type NewsFeedManifest = z.infer<typeof NewsFeedManifestSchema>;
