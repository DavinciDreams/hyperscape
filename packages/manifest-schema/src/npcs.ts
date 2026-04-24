/**
 * NPC spawn constants manifest schema.
 *
 * NOTE: Actual NPC definitions (stats, drops, etc.) are loaded at
 * runtime by `DataManager` from `world/assets/manifests/npcs.json`
 * and stored in the `ALL_NPCS` map — their schema lives in the
 * server/world pipeline, not here.
 *
 * This manifest schema covers only the global NPC spawning
 * parameters previously hardcoded as `NPC_SPAWN_CONSTANTS` in
 * `packages/shared/src/data/npcs.ts`. Extracted as part of Phase
 * A11 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import { z } from "zod";

export const NpcSpawnConstantsSchema = z.object({
  /** Global respawn time in ms (15 min = 900000 per GDD). */
  globalRespawnTime: z.number().int().positive(),
  /** Max NPCs allowed per zone. */
  maxNpcsPerZone: z.number().int().positive(),
  /**
   * Don't spawn if a player is within this radius (meters).
   */
  spawnRadiusCheck: z.number().positive(),
  /**
   * Some NPCs ignore players above this combat-level delta.
   */
  aggroLevelThreshold: z.number().int().positive(),
});
export type NpcSpawnConstants = z.infer<typeof NpcSpawnConstantsSchema>;

export const NpcsManifestSchema = z.object({
  $schema: z.literal("hyperforge.npcs.v1"),
  spawnConstants: NpcSpawnConstantsSchema,
});
export type NpcsManifest = z.infer<typeof NpcsManifestSchema>;
