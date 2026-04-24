/**
 * Commerce manifest schema.
 *
 * Source of truth for the global commerce constants (buyback rate,
 * unlimited-stock sentinels, interaction range) used by banks and
 * stores. The BANKS and GENERAL_STORES records are already loaded
 * from per-entity manifests at runtime — this schema covers the
 * remaining hardcoded constants in
 * `packages/shared/src/data/banks-stores.ts`. Extracted as part of
 * Phase A11 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import { z } from "zod";

export const CommerceManifestSchema = z.object({
  $schema: z.literal("hyperforge.commerce.v1"),
  /** Fraction of item value refunded on buyback (e.g., 0.5 = 50%). */
  defaultBuybackRate: z.number().min(0).max(1),
  /** Sentinel value meaning "unlimited" for bank slot capacity. */
  bankStorageUnlimited: z.number().int(),
  /** Sentinel value meaning "unlimited" for store stock quantity. */
  storeUnlimitedStock: z.number().int(),
  /** Meters within which a player can interact with a bank or store. */
  interactionRange: z.number().positive(),
  /** Item IDs stocked by starter general stores. */
  starterStoreItemIds: z.array(z.string().min(1)).min(1),
});
export type CommerceManifest = z.infer<typeof CommerceManifestSchema>;
