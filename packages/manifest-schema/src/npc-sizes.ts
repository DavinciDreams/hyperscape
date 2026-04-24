/**
 * NPC sizes manifest schema.
 *
 * Source of truth for NPC collision footprints (tile-grid width/depth)
 * used by range calculations. Previously hardcoded in
 * `packages/shared/src/data/npc-sizes.ts`. Extracted as part of Phase
 * A11 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 *
 * Most NPCs are 1×1. Bosses occupy larger footprints (2×2, 3×3, etc.).
 */

import { z } from "zod";

export const NPCSizeEntrySchema = z.object({
  width: z.number().int().positive(),
  depth: z.number().int().positive(),
});
export type NPCSizeEntry = z.infer<typeof NPCSizeEntrySchema>;

export const NPCSizesManifestSchema = z.object({
  $schema: z.literal("hyperforge.npc-sizes.v1"),
  /** NPC id → {width, depth} in tile units */
  sizes: z.record(z.string().min(1), NPCSizeEntrySchema),
});
export type NPCSizesManifest = z.infer<typeof NPCSizesManifestSchema>;
