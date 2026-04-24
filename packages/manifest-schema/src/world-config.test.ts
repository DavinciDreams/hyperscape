/**
 * Faithfulness test: a representative world-config manifest (covering all
 * top-level sections — terrain, towns, roads, POIs, zone generation, default
 * spawn, death, boundary markers, docks, teleport network) MUST parse
 * cleanly.
 */

import { describe, expect, it } from "vitest";

import {
  WorldConfigManifestSchema,
  type WorldConfigManifest,
} from "./world-config.js";

const reference: WorldConfigManifest = {
  terrain: {
    worldSize: 4096,
    waterThreshold: 0.2,
    tileSize: 128,
  },
  towns: {
    townCount: 6,
    minTownSpacing: 600,
    flatnessSampleRadius: 32,
    flatnessSampleCount: 16,
    optimalWaterDistanceMin: 40,
    optimalWaterDistanceMax: 200,
    sizes: {
      hamlet: {
        buildingCountMin: 3,
        buildingCountMax: 5,
        radius: 30,
        safeZoneRadius: 40,
      },
      village: {
        buildingCountMin: 6,
        buildingCountMax: 10,
        radius: 50,
        safeZoneRadius: 70,
      },
      town: {
        buildingCountMin: 12,
        buildingCountMax: 20,
        radius: 80,
        safeZoneRadius: 110,
      },
      city: {
        buildingCountMin: 25,
        buildingCountMax: 40,
        radius: 120,
        safeZoneRadius: 160,
      },
    },
  },
  roads: {
    extraConnectionRatio: 0.25,
    smoothingPasses: 4,
    maxSlopeGrade: 0.35,
    decorations: {
      signpostSpacing: 100,
      waystationSpacing: 300,
    },
  },
  pois: {
    minDistanceFromTown: 120,
    minPoiSpacing: 200,
    maxRoadExtension: 400,
    counts: {
      dungeon: 4,
      shrine: 3,
    },
  },
  zoneGeneration: {
    tiers: [
      {
        name: "starter",
        scalarRange: [0, 0.2],
        levelRange: [1, 5],
        resourceLevelRange: [1, 10],
        color: "#88cc88",
        mobDensityMultiplier: 0.5,
        resourceDensityMultiplier: 1,
        mobResourceBuffer: 4,
      },
      {
        name: "wilderness",
        scalarRange: [0.8, 1],
        levelRange: [60, 99],
        resourceLevelRange: [40, 99],
        color: "#662222",
        mobDensityMultiplier: 1.5,
        resourceDensityMultiplier: 1.2,
        mobResourceBuffer: 8,
      },
    ],
    spacing: { minMob: 4, minResource: 3, minStation: 20 },
    density: { baseMob: 0.02, baseResource: 0.03 },
    noise: { scale: 0.001, amplitude: 0.3 },
    worldRadiusFraction: 0.9,
    gridResolution: 128,
    minZoneArea: 2000,
    maxZoneSpan: 600,
  },
  defaultSpawn: {
    position: [0, 1, 0],
    fallbackAreaId: "brookhaven",
  },
  deathSettings: {
    gravestoneModel: "asset://props/gravestone.glb",
    gravestoneDuration: 600,
    safeZoneRespawnDelay: 0,
  },
  boundaryMarkers: {
    enabled: true,
    signpostModel: "asset://props/signpost.glb",
    spacing: 80,
  },
  docks: {
    targetCount: 4,
    minDockSpacing: 400,
    maxTownDistance: 150,
    searchStepSize: 10,
  },
  teleportNetwork: {
    homeNode: "brookhaven",
    unlockType: "teleport_tablet",
    cooldownSeconds: 300,
    unlockRadius: 10,
  },
};

describe("WorldConfigManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = WorldConfigManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects non-positive worldSize", () => {
    const bad: WorldConfigManifest = {
      ...reference,
      terrain: { ...reference.terrain, worldSize: 0 },
    };
    const result = WorldConfigManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects empty zone tiers array", () => {
    const bad = {
      ...reference,
      zoneGeneration: { ...reference.zoneGeneration, tiers: [] as never },
    };
    const result = WorldConfigManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects zone tier scalarRange outside [0, 1]", () => {
    const bad: WorldConfigManifest = {
      ...reference,
      zoneGeneration: {
        ...reference.zoneGeneration,
        tiers: [
          {
            ...reference.zoneGeneration.tiers[0],
            scalarRange: [0, 1.5],
          },
        ],
      },
    };
    const result = WorldConfigManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects missing teleportNetwork.homeNode", () => {
    const bad = {
      ...reference,
      teleportNetwork: { ...reference.teleportNetwork, homeNode: "" },
    };
    const result = WorldConfigManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects defaultSpawn.position with wrong tuple length", () => {
    const bad = {
      ...reference,
      defaultSpawn: {
        ...reference.defaultSpawn,
        position: [0, 1] as unknown as [number, number, number],
      },
    };
    const result = WorldConfigManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
