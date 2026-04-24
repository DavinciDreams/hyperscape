/**
 * Player emotes manifest schema.
 *
 * Source of truth for player avatar animation asset URLs. Previously
 * hardcoded in `packages/shared/src/data/playerEmotes.ts`. Extracted
 * as part of Phase A11 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 *
 * URLs use the `asset://` protocol (resolved by `world.resolveURL`)
 * and may include query parameters:
 *   - `?s=<float>` — playback speed multiplier
 *   - `?l=0` — disable animation loop
 */

import { z } from "zod";

export const EmoteUrlSchema = z.string().min(1);

export const PlayerEmotesManifestSchema = z.object({
  $schema: z.literal("hyperforge.player-emotes.v1"),
  /** emote key (e.g., "IDLE") → asset URL */
  emotes: z.record(z.string().min(1), EmoteUrlSchema),
  /** Keys of emotes that MUST be pre-loaded immediately after avatar loads */
  essentialEmoteKeys: z.array(z.string().min(1)).min(1),
});
export type PlayerEmotesManifest = z.infer<typeof PlayerEmotesManifestSchema>;
