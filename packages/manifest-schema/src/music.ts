/**
 * Music manifest schema.
 *
 * Covers `packages/server/world/assets/manifests/music.json` — the catalog
 * of background music tracks, keyed by category for runtime selection
 * (intro theme, ambient overworld, combat stings).
 */

import { z } from "zod";

export const MusicTrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["theme", "ambient", "combat"]),
  category: z.enum(["intro", "normal", "combat"]),
  path: z
    .string()
    .min(1)
    .describe("asset:// URL or relative path to .mp3/.ogg"),
  description: z.string(),
  duration: z
    .number()
    .nonnegative()
    .describe("Track length in seconds (0 = unknown/streamed)"),
  mood: z
    .string()
    .min(1)
    .describe(
      "Free-form mood tag used for blend/crossfade selection — any string",
    ),
});
export type MusicTrack = z.infer<typeof MusicTrackSchema>;

/** The manifest JSON is a bare array. */
export const MusicManifestSchema = z.array(MusicTrackSchema);
export type MusicManifest = z.infer<typeof MusicManifestSchema>;
