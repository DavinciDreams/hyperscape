/**
 * Economy-tuning manifest schema.
 *
 * Authored knobs for the persistent-world economy: currency
 * definitions, vendor price multipliers, vendor stock regeneration,
 * item-sink rates (repair/respec cost curves), and market-listing
 * fees. Scope is the *tuning* of the economy — the catalog of what
 * vendors sell lives in `stores.ts`, the catalog of items in
 * `items-metadata`, etc.
 *
 * Substrate only. Runtime systems (VendorSystem, AuctionHouseSystem,
 * RepairSystem) resolve these parameters at event time.
 */

import { z } from "zod";

/** lowerCamelCase ASCII id. */
const LowerCamelId = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_-]*$/, "id must be lowerCamelCase ASCII identifier");

/** A currency the economy tracks (gold, shards, honor points, …). */
export const CurrencySchema = z
  .object({
    id: LowerCamelId,
    name: z.string().min(1),
    symbol: z.string().min(1).max(8),
    description: z.string().default(""),
    /** Display icon id (resolved against an icon atlas). */
    iconId: z.string().default(""),
    /** Max amount a player can carry (0 = unlimited). */
    cap: z.number().int().min(0).max(1_000_000_000).default(0),
    /** Whether the currency can be traded between players. */
    tradeable: z.boolean().default(true),
    /** Whether the currency is deposited in the bank rather than inventory. */
    bankStored: z.boolean().default(true),
    /** Whether the currency persists on death (false = dropped as loot). */
    keepOnDeath: z.boolean().default(true),
  })
  .strict();
export type Currency = z.infer<typeof CurrencySchema>;

/**
 * Vendor pricing / stock knobs. Applies globally; per-store overrides
 * live in `stores.ts` as sparse multipliers.
 */
export const VendorTuningSchema = z
  .object({
    /** Global multiplier on vendor "buy from player" prices (0..1). */
    vendorBuybackMultiplier: z.number().min(0).max(1).default(0.4),
    /** Global multiplier on vendor "sell to player" prices (>=1 usually). */
    vendorSellMultiplier: z.number().min(0).max(100).default(1),
    /**
     * Minutes between stock restocks. 0 = no restock (stock depletes
     * permanently until a fresh world event refills it).
     */
    stockRestockMinutes: z.number().int().min(0).max(10_080).default(60),
    /**
     * Fraction of a vendor's original stock replenished per restock
     * tick. 0..1 — 0 = no replenishment, 1 = full reset.
     */
    stockRestockFraction: z.number().min(0).max(1).default(0.5),
    /**
     * Currency id used by default for vendor transactions. Must
     * resolve against the declared `currencies`.
     */
    defaultCurrencyId: LowerCamelId.default("gold"),
  })
  .strict();
export type VendorTuning = z.infer<typeof VendorTuningSchema>;

/**
 * Cost curve for a recurring economy action (repair, respec, teleport).
 * Runtime computes cost as `base + perLevel * level + perTier * tier`.
 * Clamping into [min, max] prevents runaway costs at extreme inputs.
 */
export const CostCurveSchema = z
  .object({
    id: LowerCamelId,
    description: z.string().default(""),
    /** Currency id the cost is charged in. */
    currencyId: LowerCamelId,
    /** Flat base cost. */
    base: z.number().min(0).max(1_000_000_000).default(0),
    /** Cost per unit of `level` passed in at runtime. */
    perLevel: z.number().min(0).max(1_000_000).default(0),
    /** Cost per unit of `tier` passed in at runtime. */
    perTier: z.number().min(0).max(1_000_000).default(0),
    /** Minimum cost after curve applied. */
    min: z.number().min(0).max(1_000_000_000).default(0),
    /** Maximum cost after curve applied. */
    max: z.number().min(0).max(1_000_000_000).default(1_000_000_000),
  })
  .strict()
  .refine(({ min, max }) => min <= max, {
    message: "`min` must be <= `max`",
  });
export type CostCurve = z.infer<typeof CostCurveSchema>;

/**
 * Auction / market rules — player-to-player trade layer fees.
 */
export const MarketRulesSchema = z
  .object({
    /** Is the player market enabled at all? */
    enabled: z.boolean().default(true),
    /** Currency used for listings. */
    currencyId: LowerCamelId.default("gold"),
    /**
     * Flat listing fee charged on post. Non-refundable; deters spam.
     */
    listingFee: z.number().int().min(0).max(1_000_000_000).default(100),
    /**
     * Percent commission deducted from sale proceeds (0..1 = 0%..100%).
     */
    salesCommission: z.number().min(0).max(1).default(0.05),
    /**
     * Max concurrent listings per player.
     */
    maxListingsPerPlayer: z.number().int().min(1).max(10_000).default(24),
    /** Listing expiry in hours (rounded down). */
    listingExpiryHours: z.number().int().min(1).max(720).default(48),
    /** Min sale price in `currencyId` smallest units. */
    minListingPrice: z.number().int().min(1).max(1_000_000_000).default(1),
  })
  .strict();
export type MarketRules = z.infer<typeof MarketRulesSchema>;

export const EconomyTuningManifestSchema = z
  .object({
    currencies: z.array(CurrencySchema).min(1),
    vendor: VendorTuningSchema.default({
      vendorBuybackMultiplier: 0.4,
      vendorSellMultiplier: 1,
      stockRestockMinutes: 60,
      stockRestockFraction: 0.5,
      defaultCurrencyId: "gold",
    }),
    /** Cost curves for actions like repair, respec, fast-travel. */
    costCurves: z.array(CostCurveSchema).default([]),
    market: MarketRulesSchema.default({
      enabled: true,
      currencyId: "gold",
      listingFee: 100,
      salesCommission: 0.05,
      maxListingsPerPlayer: 24,
      listingExpiryHours: 48,
      minListingPrice: 1,
    }),
  })
  .strict()
  .refine(
    ({ currencies }) =>
      new Set(currencies.map((c) => c.id)).size === currencies.length,
    { message: "currency ids must be unique" },
  )
  .refine(
    ({ costCurves }) =>
      new Set(costCurves.map((c) => c.id)).size === costCurves.length,
    { message: "cost curve ids must be unique" },
  )
  .refine(
    ({ currencies, vendor }) =>
      currencies.some((c) => c.id === vendor.defaultCurrencyId),
    {
      message: "`vendor.defaultCurrencyId` must reference a declared currency",
    },
  )
  .refine(
    ({ currencies, market }) =>
      !market.enabled || currencies.some((c) => c.id === market.currencyId),
    {
      message:
        "`market.currencyId` must reference a declared currency when market is enabled",
    },
  )
  .refine(
    ({ currencies, costCurves }) => {
      const ids = new Set(currencies.map((c) => c.id));
      return costCurves.every((c) => ids.has(c.currencyId));
    },
    {
      message:
        "every cost-curve `currencyId` must reference a declared currency",
    },
  )
  .refine(
    ({ market, currencies }) => {
      if (!market.enabled) return true;
      const cur = currencies.find((c) => c.id === market.currencyId);
      if (!cur) return true; // earlier refinement catches
      return cur.tradeable;
    },
    {
      message:
        "market `currencyId` must reference a `tradeable` currency (non-tradeable currencies cannot change hands via listings)",
    },
  );
export type EconomyTuningManifest = z.infer<typeof EconomyTuningManifestSchema>;
