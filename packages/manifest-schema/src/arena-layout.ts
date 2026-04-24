/**
 * Arena layout manifest schema.
 *
 * Source of truth for the duel/combat arena complex positioning —
 * arena grid, lobby, hospital, and lobby spawn point. Previously
 * hardcoded in `packages/shared/src/data/arena-layout.ts`. Extracted
 * as part of Phase A11 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 *
 * All arena positioning (visuals, server logic, zone bounds) derives
 * from these values. Derived ZONE_BOUNDS_* remain computed in the
 * façade.
 */

import { z } from "zod";

export const ArenaGridSchema = z.object({
  baseX: z.number(),
  baseZ: z.number(),
  baseY: z.number(),
  width: z.number().positive(),
  length: z.number().positive(),
  gap: z.number().nonnegative(),
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  count: z.number().int().positive(),
  spawnOffset: z.number(),
});
export type ArenaGrid = z.infer<typeof ArenaGridSchema>;

export const ArenaBuildingSchema = z.object({
  centerX: z.number(),
  centerZ: z.number(),
  width: z.number().positive(),
  length: z.number().positive(),
});
export type ArenaBuilding = z.infer<typeof ArenaBuildingSchema>;

export const ArenaLobbySpawnSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});
export type ArenaLobbySpawn = z.infer<typeof ArenaLobbySpawnSchema>;

export const ArenaLayoutManifestSchema = z.object({
  $schema: z.literal("hyperforge.arena-layout.v1"),
  arenaGrid: ArenaGridSchema,
  lobby: ArenaBuildingSchema,
  hospital: ArenaBuildingSchema,
  lobbySpawn: ArenaLobbySpawnSchema,
});
export type ArenaLayoutManifest = z.infer<typeof ArenaLayoutManifestSchema>;
