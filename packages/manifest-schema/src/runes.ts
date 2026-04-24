/**
 * Runes manifest schema.
 *
 * Source of truth for rune metadata and elemental staff mappings. The
 * canonical JSON lives at
 * `packages/server/world/assets/manifests/runes.json` — already consumed
 * by the server startup config, web3 item id mapping, and asset-forge
 * manifest tooling.
 *
 * Phase A11 extraction: replaces the duplicated hardcoded data in
 * `packages/shared/src/data/runes.ts` (`ELEMENTAL_STAVES`, `RUNE_NAMES`,
 * `VALID_RUNES`) by making that file a façade that derives its exports
 * from this manifest.
 */

import { z } from "zod";

export const RuneEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Element tag (air/water/earth/fire) or null for non-elemental runes */
  element: z.string().min(1).nullable(),
  stackable: z.boolean(),
});
export type RuneEntry = z.infer<typeof RuneEntrySchema>;

export const ElementalStaffEntrySchema = z.object({
  staffId: z.string().min(1),
  /** Rune ids this staff provides an infinite supply of */
  providesInfinite: z.array(z.string().min(1)).min(1),
});
export type ElementalStaffEntry = z.infer<typeof ElementalStaffEntrySchema>;

export const RunesManifestSchema = z.object({
  _comment: z.string().optional(),
  runes: z.array(RuneEntrySchema).min(1),
  elementalStaves: z.array(ElementalStaffEntrySchema).min(1),
});
export type RunesManifest = z.infer<typeof RunesManifestSchema>;
