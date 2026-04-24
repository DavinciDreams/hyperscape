/**
 * World structure constants manifest schema.
 *
 * Source of truth for global grid/terrain/zone sizing constants
 * (`WORLD_STRUCTURE_CONSTANTS`). Previously hardcoded in
 * `packages/shared/src/data/world-structure.ts`.
 *
 * Note: The rest of `world-structure.ts` (BIOMES, WORLD_ZONES,
 * STARTER_ZONES, WorldJson types, WorldJsonSpatialIndex) is already
 * data-driven at runtime by DataManager from biomes.json/zones.json,
 * or is pure type/class material that does not need extraction.
 *
 * Extracted as part of Phase A11 of
 * `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import { z } from "zod";

export const WorldStructureConstantsSchema = z.object({
  /** Block size for grid-based movement. */
  gridSize: z.number().positive(),
  /** Default Y height at which players spawn above terrain. */
  defaultSpawnHeight: z.number(),
  /** Water level Y (must match TERRAIN_CONSTANTS.WATER_THRESHOLD). */
  waterLevel: z.number(),
  /** Maximum build height above terrain. */
  maxBuildHeight: z.number().positive(),
  /** Radius around starter towns with no hostile mobs. */
  safeZoneRadius: z.number().positive(),
});
export type WorldStructureConstants = z.infer<
  typeof WorldStructureConstantsSchema
>;

export const WorldStructureManifestSchema = z.object({
  $schema: z.literal("hyperforge.world-structure.v1"),
  constants: WorldStructureConstantsSchema,
});
export type WorldStructureManifest = z.infer<
  typeof WorldStructureManifestSchema
>;
