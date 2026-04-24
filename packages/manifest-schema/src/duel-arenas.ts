/**
 * Duel arenas manifest schema.
 *
 * Covers `packages/server/world/assets/manifests/duel-arenas.json` — the
 * hand-placed arena grid used by the streaming duel scheduler plus the
 * shared lobby/hospital transit areas.
 *
 * Positions use `{x, z}` for 2D map placement and `{x, y, z}` for actual
 * spawn points (y = ground clamp at spawn time).
 */

import { z } from "zod";

const Vec2Schema = z.object({
  x: z.number(),
  z: z.number(),
});

const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const DimensionsSchema = z.object({
  width: z.number().positive(),
  depth: z.number().positive(),
});

export const DuelArenaSchema = z.object({
  arenaId: z.number().int().positive(),
  center: Vec2Schema,
  size: z.number().positive(),
  spawnPoints: z.array(Vec3Schema).nonempty(),
  trapdoorPositions: z.array(Vec2Schema),
});
export type DuelArena = z.infer<typeof DuelArenaSchema>;

const TransitAreaSchema = z.object({
  center: Vec2Schema,
  size: DimensionsSchema,
  spawnPoint: Vec3Schema,
});

/** Visual constants — reused across all arenas in the manifest. */
export const DuelArenaConstantsSchema = z.object({
  arenaSize: z.number().positive(),
  wallHeight: z.number().positive(),
  wallThickness: z.number().positive(),
  floorColor: z.string().min(1),
  wallColor: z.string().min(1),
  trapdoorColor: z.string().min(1),
});
export type DuelArenaConstants = z.infer<typeof DuelArenaConstantsSchema>;

export const DuelArenasManifestSchema = z.object({
  arenas: z.array(DuelArenaSchema).nonempty(),
  lobby: TransitAreaSchema,
  hospital: TransitAreaSchema,
  constants: DuelArenaConstantsSchema,
});
export type DuelArenasManifest = z.infer<typeof DuelArenasManifestSchema>;
