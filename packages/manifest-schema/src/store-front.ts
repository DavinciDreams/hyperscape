/**
 * Store-front manifest schema.
 *
 * Authored catalog for the real-money / premium-currency store:
 * bundles, featured shelves, discount rules, regional pricing tiers,
 * age-gated items. Manages the *presentation* and *pricing* of
 * purchasable bundles; the underlying entitlement fulfillment lives
 * in `commerce.ts`.
 *
 * Scope-isolated from:
 *   - `commerce.ts` (item-level trading, NPC shops, auctions)
 *   - `license-agreements.ts` (terms gating purchases by
 *     jurisdiction)
 *   - `parental-controls.ts` (per-profile spend caps)
 *   - `news-feed.ts` (featured shelves may mirror announcements
 *     but content is separate)
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

const Id = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_-]*$/, "id must be lowerCamelCase ASCII identifier");

/** Region code — ISO-3166-1 alpha-2 + 'global'. */
const RegionCode = z
  .string()
  .regex(
    /^(global|[A-Z]{2})$/,
    "region must be 'global' or ISO-3166-1 alpha-2",
  );

/** Price tier — abstract tier id (e.g. "tier_4.99_usd"). Authored. */
export const PriceTierSchema = z
  .object({
    id: Id,
    /** Display format reference (e.g. "USD_CENTS"). */
    displayFormatKey: z.string().min(1),
    /** Canonical cents / smallest-unit (for sorting + display). */
    canonicalAmountCents: z.number().int().min(0).max(1_000_000_000),
    /** Per-region override amounts (empty = use canonical). */
    regionAmounts: z
      .array(
        z
          .object({
            region: RegionCode,
            amountCents: z.number().int().min(0).max(1_000_000_000),
            currencyCode: z
              .string()
              .regex(/^[A-Z]{3}$/, "currencyCode must be ISO-4217 3-letter"),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()
  .refine(
    (t) =>
      new Set(t.regionAmounts.map((r) => r.region)).size ===
      t.regionAmounts.length,
    {
      message: "regionAmounts must be unique per region",
      path: ["regionAmounts"],
    },
  );
export type PriceTier = z.infer<typeof PriceTierSchema>;

/** One bundle / SKU. */
export const BundleSchema = z
  .object({
    id: Id,
    titleLocalizationKey: z.string().min(1),
    descriptionLocalizationKey: z.string().default(""),
    /** Preview image (e.g. card hero). */
    heroAssetRef: ManifestRef,
    /** Thumbnail image. */
    thumbnailAssetRef: ManifestRef.optional(),
    /** Price tier id (resolves to PriceTierSchema by loader). */
    priceTierId: z.string().min(1),
    /** Contents as commerce entitlement ids. */
    entitlementIds: z.array(z.string().min(1)).min(1),
    /** Tag for shelf filtering. */
    categoryTag: z.string().default(""),
    /** Min age to purchase (0 = no age gate). */
    minAgeYears: z.number().int().min(0).max(99).default(0),
    /** ISO publish window start (inclusive, empty = always). */
    publishAtIso: z.string().default(""),
    /** ISO publish window end (exclusive, empty = never). */
    expireAtIso: z.string().default(""),
    /** Limit purchase frequency per player — 0 = no cap. */
    maxPurchasesPerPlayer: z.number().int().min(0).max(10000).default(0),
  })
  .strict()
  .refine((b) => new Set(b.entitlementIds).size === b.entitlementIds.length, {
    message: "entitlementIds must be unique within bundle",
    path: ["entitlementIds"],
  })
  .refine(
    (b) =>
      b.publishAtIso === "" ||
      b.expireAtIso === "" ||
      b.publishAtIso < b.expireAtIso,
    {
      message: "expireAtIso must be > publishAtIso",
      path: ["expireAtIso"],
    },
  );
export type Bundle = z.infer<typeof BundleSchema>;

/** Discount kind — flat off or percent off. */
export const DiscountKindSchema = z.enum([
  "percentOff",
  "flatCentsOff",
  "bonusEntitlement",
]);
export type DiscountKind = z.infer<typeof DiscountKindSchema>;

/** Discount rule applying to a bundle or category. */
export const DiscountRuleSchema = z
  .object({
    id: Id,
    kind: DiscountKindSchema,
    /** Target bundle ids (empty = apply to categoryTag). */
    bundleIds: z.array(z.string().min(1)).default([]),
    /** Apply to all bundles matching this category tag (empty = N/A). */
    categoryTag: z.string().default(""),
    /** 0..100 for percentOff; 0..1B for flatCentsOff; 0 for bonusEntitlement. */
    amount: z.number().min(0).max(1_000_000_000),
    /** For bonusEntitlement: entitlement id granted alongside purchase. */
    bonusEntitlementId: z.string().default(""),
    /** ISO start/end of discount. */
    startAtIso: z.string().default(""),
    endAtIso: z.string().default(""),
    /** Priority when multiple rules match. Highest wins. */
    priority: z.number().int().min(0).max(1000).default(100),
  })
  .strict()
  .refine((r) => r.bundleIds.length > 0 || r.categoryTag.length > 0, {
    message: "discount rule must target bundleIds or categoryTag",
    path: ["bundleIds"],
  })
  .refine((r) => r.kind !== "percentOff" || r.amount <= 100, {
    message: "percentOff amount must be 0..100",
    path: ["amount"],
  })
  .refine(
    (r) => r.kind !== "bonusEntitlement" || r.bonusEntitlementId.length > 0,
    {
      message: "bonusEntitlement requires bonusEntitlementId",
      path: ["bonusEntitlementId"],
    },
  )
  .refine(
    (r) =>
      r.startAtIso === "" || r.endAtIso === "" || r.startAtIso < r.endAtIso,
    {
      message: "endAtIso must be > startAtIso",
      path: ["endAtIso"],
    },
  );
export type DiscountRule = z.infer<typeof DiscountRuleSchema>;

/** Featured shelf — curated bundle list shown in-store. */
export const ShelfSchema = z
  .object({
    id: Id,
    titleLocalizationKey: z.string().min(1),
    bundleIds: z.array(z.string().min(1)).min(1),
    /** Display order of shelf (ascending). */
    displayOrder: z.number().int().min(0).max(10000).default(0),
    /** Banner asset. */
    bannerAssetRef: ManifestRef.optional(),
  })
  .strict()
  .refine((s) => new Set(s.bundleIds).size === s.bundleIds.length, {
    message: "bundleIds must be unique in shelf",
    path: ["bundleIds"],
  });
export type Shelf = z.infer<typeof ShelfSchema>;

/** Top-level store-front manifest. */
export const StoreFrontManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    priceTiers: z.array(PriceTierSchema).default([]),
    bundles: z.array(BundleSchema).default([]),
    shelves: z.array(ShelfSchema).default([]),
    discountRules: z.array(DiscountRuleSchema).default([]),
    /** Global spend cap per player per day (0 = no cap). */
    globalDailySpendCapCents: z
      .number()
      .int()
      .min(0)
      .max(1_000_000_000)
      .default(0),
    /** Require agreement to current ToS before first purchase. */
    requiresLicenseAgreement: z.boolean().default(true),
  })
  .strict()
  .refine(
    (m) => new Set(m.priceTiers.map((t) => t.id)).size === m.priceTiers.length,
    { message: "price tier ids must be unique", path: ["priceTiers"] },
  )
  .refine(
    (m) => new Set(m.bundles.map((b) => b.id)).size === m.bundles.length,
    { message: "bundle ids must be unique", path: ["bundles"] },
  )
  .refine(
    (m) => new Set(m.shelves.map((s) => s.id)).size === m.shelves.length,
    { message: "shelf ids must be unique", path: ["shelves"] },
  )
  .refine(
    (m) =>
      new Set(m.discountRules.map((r) => r.id)).size === m.discountRules.length,
    { message: "discount rule ids must be unique", path: ["discountRules"] },
  )
  .refine(
    (m) => {
      const tierIds = new Set(m.priceTiers.map((t) => t.id));
      return m.bundles.every((b) => tierIds.has(b.priceTierId));
    },
    {
      message: "bundle.priceTierId must resolve to a defined price tier",
      path: ["bundles"],
    },
  )
  .refine(
    (m) => {
      const bundleIds = new Set(m.bundles.map((b) => b.id));
      for (const s of m.shelves) {
        for (const id of s.bundleIds) {
          if (!bundleIds.has(id)) return false;
        }
      }
      return true;
    },
    {
      message: "shelf bundleIds must resolve to defined bundles",
      path: ["shelves"],
    },
  )
  .refine(
    (m) => {
      const bundleIds = new Set(m.bundles.map((b) => b.id));
      for (const r of m.discountRules) {
        for (const id of r.bundleIds) {
          if (!bundleIds.has(id)) return false;
        }
      }
      return true;
    },
    {
      message: "discount rule bundleIds must resolve to defined bundles",
      path: ["discountRules"],
    },
  );
export type StoreFrontManifest = z.infer<typeof StoreFrontManifestSchema>;
