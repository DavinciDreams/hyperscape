import { WorldConfigManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  UnknownTownSizeError,
  WorldConfigNotLoadedError,
  WorldConfigRegistry,
} from "../WorldConfigRegistry.js";

function manifest() {
  const size = {
    buildingCountMin: 3,
    buildingCountMax: 6,
    radius: 25,
    safeZoneRadius: 30,
  };
  return WorldConfigManifestSchema.parse({
    terrain: { worldSize: 1000, waterThreshold: 0, tileSize: 1 },
    towns: {
      townCount: 6,
      minTownSpacing: 200,
      flatnessSampleRadius: 20,
      flatnessSampleCount: 16,
      optimalWaterDistanceMin: 20,
      optimalWaterDistanceMax: 80,
      sizes: {
        hamlet: { ...size, buildingCountMin: 2, buildingCountMax: 4 },
        village: size,
        town: { ...size, buildingCountMin: 8, buildingCountMax: 14 },
        city: { ...size, buildingCountMin: 20, buildingCountMax: 30 },
      },
    },
    roads: {
      extraConnectionRatio: 0.25,
      smoothingPasses: 3,
      maxSlopeGrade: 0.4,
      decorations: { signpostSpacing: 25, waystationSpacing: 200 },
    },
    pois: {
      minDistanceFromTown: 60,
      minPoiSpacing: 100,
      maxRoadExtension: 50,
      counts: { ruin: 8, landmark: 4 },
    },
    zoneGeneration: {
      tiers: [
        {
          name: "safe",
          scalarRange: [0, 0.33],
          levelRange: [0, 5],
          resourceLevelRange: [1, 10],
          color: "#00ff00",
          mobDensityMultiplier: 0.5,
          resourceDensityMultiplier: 1,
          mobResourceBuffer: 3,
        },
        {
          name: "medium",
          scalarRange: [0.33, 0.66],
          levelRange: [5, 20],
          resourceLevelRange: [10, 25],
          color: "#ffcc00",
          mobDensityMultiplier: 1,
          resourceDensityMultiplier: 1,
          mobResourceBuffer: 5,
        },
        {
          name: "dangerous",
          scalarRange: [0.66, 1],
          levelRange: [20, 99],
          resourceLevelRange: [25, 99],
          color: "#ff0000",
          mobDensityMultiplier: 2,
          resourceDensityMultiplier: 1,
          mobResourceBuffer: 10,
        },
      ],
      spacing: { minMob: 3, minResource: 2, minStation: 5 },
      density: { baseMob: 1, baseResource: 1 },
      noise: { scale: 0.1, amplitude: 1 },
      worldRadiusFraction: 0.4,
      gridResolution: 128,
      minZoneArea: 100,
      maxZoneSpan: 500,
    },
    defaultSpawn: { position: [0, 0, 0], fallbackAreaId: "lumbridge" },
    deathSettings: {
      gravestoneModel: "gravestone.glb",
      gravestoneDuration: 300,
      safeZoneRespawnDelay: 3,
    },
    boundaryMarkers: {
      enabled: true,
      signpostModel: "signpost.glb",
      spacing: 50,
    },
    docks: {
      targetCount: 4,
      minDockSpacing: 100,
      maxTownDistance: 150,
      searchStepSize: 10,
    },
    teleportNetwork: {
      homeNode: "lumbridge",
      unlockType: "visit",
      cooldownSeconds: 60,
      unlockRadius: 10,
    },
  });
}

describe("WorldConfigRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new WorldConfigRegistry().manifest).toThrow(
      WorldConfigNotLoadedError,
    );
  });

  it("block accessors", () => {
    const r = new WorldConfigRegistry(manifest());
    expect(r.terrain.worldSize).toBe(1000);
    expect(r.towns.townCount).toBe(6);
    expect(r.teleportNetwork.homeNode).toBe("lumbridge");
  });

  it("townSize + unknown error", () => {
    const r = new WorldConfigRegistry(manifest());
    expect(r.townSize("city").buildingCountMin).toBe(20);
    expect(() => r.townSize("megacity" as "city")).toThrow(
      UnknownTownSizeError,
    );
  });

  it("poiCount returns 0 for unknown", () => {
    const r = new WorldConfigRegistry(manifest());
    expect(r.poiCount("ruin")).toBe(8);
    expect(r.poiCount("ghost")).toBe(0);
  });

  it("tierForScalar walks tier bands", () => {
    const r = new WorldConfigRegistry(manifest());
    expect(r.tierForScalar(0.1)?.name).toBe("safe");
    expect(r.tierForScalar(0.5)?.name).toBe("medium");
    expect(r.tierForScalar(0.9)?.name).toBe("dangerous");
  });
});
