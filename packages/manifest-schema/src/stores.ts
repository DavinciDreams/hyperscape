/**
 * Stores manifest schema.
 *
 * Covers `packages/server/world/assets/manifests/stores.json` — shop
 * catalogs (general store, armor store, magic store, etc.).
 *
 * `stockQuantity: -1` indicates unlimited/infinite stock.
 */

import { z } from "zod";

export const StoreItemSchema = z
  .object({
    /** Entry id within the store — often (but not always) equal to itemId. */
    id: z.string().min(1),
    /** Reference to the global item catalog. */
    itemId: z.string().min(1),
    name: z.string().min(1),
    price: z.number().int().nonnegative(),
    /** -1 means unlimited stock. */
    stockQuantity: z.number().int().gte(-1),
    restockTime: z.number().nonnegative(),
    description: z.string().optional(),
    category: z.string().min(1).optional(),
  })
  .passthrough();
export type StoreItem = z.infer<typeof StoreItemSchema>;

export const StoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  /** Whether the store will buy items back from the player. */
  buyback: z.boolean(),
  /** If buyback, the multiplier applied to the player's sell price (0–1). */
  buybackRate: z.number().min(0).max(1).optional(),
  items: z.array(StoreItemSchema),
});
export type Store = z.infer<typeof StoreSchema>;

/** The manifest is a bare array. */
export const StoresManifestSchema = z.array(StoreSchema);
export type StoresManifest = z.infer<typeof StoresManifestSchema>;
