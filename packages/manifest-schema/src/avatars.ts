/**
 * Avatars manifest schema.
 *
 * Source of truth for available VRM avatar models (with 3-tier LOD
 * URLs and preview path) and LOD switching distance thresholds.
 * Previously hardcoded in `packages/shared/src/data/avatars.ts`.
 * Extracted as part of Phase A11 of
 * `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 *
 * LOD tiers:
 *   - LOD0 (`url`, required): ~30K triangles, close range
 *   - LOD1 (`lod1Url`, optional): ~10K triangles, medium distance
 *   - LOD2 (`lod2Url`, optional): ~2K triangles, far distance / impostor
 */

import { z } from "zod";

export const AvatarEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** LOD0 URL (30K triangles, required). Uses `asset://` protocol. */
  url: z.string().min(1),
  /** LOD1 URL (10K triangles, optional). */
  lod1Url: z.string().min(1).optional(),
  /** LOD2 URL (2K triangles, optional). */
  lod2Url: z.string().min(1).optional(),
  /** Path portion for character preview (prepend CDN URL). */
  previewPath: z.string().min(1),
  description: z.string().optional(),
});
export type AvatarEntry = z.infer<typeof AvatarEntrySchema>;

export const AvatarLodDistancesSchema = z.object({
  /** Distance (m) at which to switch from LOD0 to LOD1. */
  lod0ToLod1: z.number().positive(),
  /** Distance (m) at which to switch from LOD1 to LOD2. */
  lod1ToLod2: z.number().positive(),
});
export type AvatarLodDistances = z.infer<typeof AvatarLodDistancesSchema>;

export const AvatarsManifestSchema = z.object({
  $schema: z.literal("hyperforge.avatars.v1"),
  avatars: z.array(AvatarEntrySchema).min(1),
  lodDistances: AvatarLodDistancesSchema,
});
export type AvatarsManifest = z.infer<typeof AvatarsManifestSchema>;
