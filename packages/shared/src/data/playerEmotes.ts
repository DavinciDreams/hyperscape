/**
 * playerEmotes.ts - Player Animation Asset URLs (MANIFEST FAÇADE)
 *
 * As of Phase A11 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, player emote
 * animation URLs live in `player-emotes.json`, validated at module
 * load time against `PlayerEmotesManifestSchema` from
 * `@hyperforge/manifest-schema`.
 *
 * Centralized list of animation asset URLs for player characters.
 * These Mixamo-compatible animations are applied to VRM avatars.
 *
 * Animation Files:
 * - All animations are GLB files containing skeletal animations
 * - Located in /assets/emotes/ directory
 * - Query parameter `?s=1.5` sets playback speed (1.5x faster)
 * - Query parameter `?l=0` disables animation looping
 *
 * Usage:
 * - PlayerLocal and PlayerRemote use these for character animation
 * - Avatar system retargets animations to VRM skeleton
 * - Emotes are applied via avatar.setEmote(Emotes.WALK)
 *
 * Referenced by: PlayerLocal, PlayerRemote, Avatar node
 */

import { PlayerEmotesManifestSchema } from "@hyperforge/manifest-schema";

import playerEmotesManifestJson from "./player-emotes.json" with { type: "json" };

// Preserve narrow key union by typing against the pre-parse import.
type EmoteKey = keyof typeof playerEmotesManifestJson.emotes;

const manifest = PlayerEmotesManifestSchema.parse(playerEmotesManifestJson);

/**
 * Player Animation URLs.
 *
 * Standard animations for player characters.
 * URLs are resolved via world.resolveURL() to CDN or local paths.
 */
export const Emotes: Readonly<Record<EmoteKey, string>> = (() => {
  const map = {} as Record<EmoteKey, string>;
  for (const [key, url] of Object.entries(manifest.emotes) as Array<
    [EmoteKey, string]
  >) {
    map[key] = url;
  }
  return Object.freeze(map);
})();

/** Array of all emote URLs (for preloading) */
export const emoteUrls: readonly string[] = Object.freeze(
  Object.values(manifest.emotes),
);

/**
 * Essential emotes that MUST be pre-loaded immediately after avatar loads.
 * These are the most commonly used emotes that would cause visible T-pose flash
 * if loaded on-demand during gameplay.
 */
export const essentialEmotes: readonly string[] = Object.freeze(
  manifest.essentialEmoteKeys.map((key) => {
    const url = manifest.emotes[key];
    if (url === undefined) {
      throw new Error(
        `playerEmotes drift: essentialEmoteKeys references unknown emote "${key}"`,
      );
    }
    return url;
  }),
);
