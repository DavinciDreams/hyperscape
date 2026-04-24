/**
 * Buildings manifest schema.
 *
 * Covers `packages/server/world/assets/manifests/buildings.json` — the
 * building catalog used by procgen town placement.
 *
 * The JSON is currently an empty array (`[]`). This schema accepts any
 * future building entries with flexible fields so procgen can extend the
 * shape without blocking on a schema update — tighten when the real entry
 * shape lands.
 */

import { z } from "zod";

/** Placeholder entry — accepts arbitrary building metadata until procgen
 *  defines the canonical shape. Use `passthrough()` to avoid silently
 *  dropping fields. */
export const BuildingSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();
export type Building = z.infer<typeof BuildingSchema>;

export const BuildingsManifestSchema = z.array(BuildingSchema);
export type BuildingsManifest = z.infer<typeof BuildingsManifestSchema>;
