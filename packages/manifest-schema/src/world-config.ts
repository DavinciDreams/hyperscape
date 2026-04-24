/**
 * World config manifest schema.
 *
 * Covers `packages/server/world/assets/manifests/world-config.json` — top-
 * level world-generation parameters used by the procgen pipeline (terrain
 * sizing, town count/sizes, road smoothing, POI quotas, zone-difficulty
 * tiers, default spawn, death settings, teleport network).
 */

import { z } from "zod";

/** One town-size bracket with building count + physical radius. */
export const TownSizeSchema = z.object({
  buildingCountMin: z.number().int().positive(),
  buildingCountMax: z.number().int().positive(),
  radius: z.number().positive(),
  safeZoneRadius: z.number().positive(),
});
export type TownSize = z.infer<typeof TownSizeSchema>;

/** One difficulty tier in the zone-generation heatmap. */
export const ZoneTierSchema = z.object({
  name: z.string().min(1),
  scalarRange: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  levelRange: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]),
  resourceLevelRange: z.tuple([
    z.number().int().positive(),
    z.number().int().positive(),
  ]),
  color: z.string().min(1),
  mobDensityMultiplier: z.number().nonnegative(),
  resourceDensityMultiplier: z.number().nonnegative(),
  mobResourceBuffer: z.number().nonnegative(),
});
export type ZoneTier = z.infer<typeof ZoneTierSchema>;

export const WorldConfigManifestSchema = z.object({
  terrain: z.object({
    worldSize: z.number().positive(),
    waterThreshold: z.number(),
    tileSize: z.number().positive(),
  }),

  towns: z.object({
    townCount: z.number().int().positive(),
    minTownSpacing: z.number().positive(),
    flatnessSampleRadius: z.number().positive(),
    flatnessSampleCount: z.number().int().positive(),
    optimalWaterDistanceMin: z.number().nonnegative(),
    optimalWaterDistanceMax: z.number().positive(),
    sizes: z.object({
      hamlet: TownSizeSchema,
      village: TownSizeSchema,
      town: TownSizeSchema,
      city: TownSizeSchema,
    }),
  }),

  roads: z.object({
    extraConnectionRatio: z.number().min(0).max(1),
    smoothingPasses: z.number().int().nonnegative(),
    maxSlopeGrade: z.number().positive(),
    decorations: z.object({
      signpostSpacing: z.number().positive(),
      waystationSpacing: z.number().positive(),
    }),
  }),

  pois: z.object({
    minDistanceFromTown: z.number().nonnegative(),
    minPoiSpacing: z.number().positive(),
    maxRoadExtension: z.number().positive(),
    counts: z.record(z.string(), z.number().int().nonnegative()),
  }),

  zoneGeneration: z.object({
    tiers: z.array(ZoneTierSchema).nonempty(),
    spacing: z.object({
      minMob: z.number().positive(),
      minResource: z.number().positive(),
      minStation: z.number().positive(),
    }),
    density: z.object({
      baseMob: z.number().positive(),
      baseResource: z.number().positive(),
    }),
    noise: z.object({
      scale: z.number().positive(),
      amplitude: z.number().nonnegative(),
    }),
    worldRadiusFraction: z.number().positive().max(1),
    gridResolution: z.number().int().positive(),
    minZoneArea: z.number().positive(),
    maxZoneSpan: z.number().positive(),
  }),

  defaultSpawn: z.object({
    position: z.tuple([z.number(), z.number(), z.number()]),
    fallbackAreaId: z.string().min(1),
  }),

  deathSettings: z.object({
    gravestoneModel: z.string().min(1),
    gravestoneDuration: z.number().positive(),
    safeZoneRespawnDelay: z.number().nonnegative(),
  }),

  boundaryMarkers: z.object({
    enabled: z.boolean(),
    signpostModel: z.string().min(1),
    spacing: z.number().positive(),
  }),

  docks: z.object({
    targetCount: z.number().int().positive(),
    minDockSpacing: z.number().positive(),
    maxTownDistance: z.number().positive(),
    searchStepSize: z.number().positive(),
  }),

  teleportNetwork: z.object({
    homeNode: z.string().min(1),
    unlockType: z.string().min(1),
    cooldownSeconds: z.number().nonnegative(),
    unlockRadius: z.number().positive(),
  }),
});
export type WorldConfigManifest = z.infer<typeof WorldConfigManifestSchema>;
