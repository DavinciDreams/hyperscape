/**
 * useManifestCompiler — Compiles WorldProject data into deployment manifest format
 *
 * Transforms the editor's structured world data (placements, overrides, configs)
 * into the 38+ manifest JSON files that the game server expects.
 *
 * Used by the deployment pipeline when pushing to staging.
 */

import { useCallback } from "react";

import type { WorldData } from "../../WorldBuilder/types";
import type {
  ExtendedWorldLayers,
  AudioLayers,
  ManifestData,
  BrushOverlays,
  DeploymentDiff,
  ManifestDiffEntry,
} from "../types";
import { MANIFEST_REGISTRY } from "../types";

/** Compiled manifest output: filename → JSON content */
export interface CompiledManifests {
  files: Map<string, unknown>;
  worldJson: Record<string, unknown>;
}

/**
 * Compile world data into world.json entity spawn definitions.
 * The server loads entities from this file separately from manifests.
 */
function compileWorldJson(
  world: WorldData,
  extendedLayers: ExtendedWorldLayers,
): Record<string, unknown> {
  // Compile NPC placements
  const npcs = world.layers.npcs.map((npc) => ({
    id: npc.id,
    npcTypeId: npc.npcTypeId,
    name: npc.name,
    position: npc.position,
    rotation: npc.rotation,
    context: npc.parentContext,
    storeId: npc.storeId,
    dialogId: npc.dialogId,
  }));

  // Compile mob spawns
  const mobSpawns = extendedLayers.mobSpawns.map((ms) => ({
    id: ms.id,
    mobId: ms.mobId,
    name: ms.name,
    position: ms.position,
    spawnRadius: ms.spawnRadius,
    maxCount: ms.maxCount,
    respawnTicks: ms.respawnTicks,
  }));

  // Compile resources
  const resources = extendedLayers.resources.map((r) => ({
    id: r.id,
    resourceId: r.resourceId,
    resourceType: r.resourceType,
    name: r.name,
    position: r.position,
    rotation: r.rotation,
    modelVariant: r.modelVariant,
  }));

  // Compile stations
  const stations = extendedLayers.stations.map((s) => ({
    id: s.id,
    stationType: s.stationType,
    name: s.name,
    position: s.position,
    rotation: s.rotation,
  }));

  // Compile spawn points
  const spawnPoints = extendedLayers.spawnPoints.map((sp) => ({
    id: sp.id,
    name: sp.name,
    position: sp.position,
    rotation: sp.rotation,
    spawnType: sp.spawnType,
    capacity: sp.capacity,
    linkedAreaId: sp.linkedAreaId,
  }));

  // Compile teleports
  const teleports = extendedLayers.teleports.map((tp) => ({
    id: tp.id,
    name: tp.name,
    position: tp.position,
    connections: tp.connections,
  }));

  // Compile POIs
  const pois = extendedLayers.pois.map((poi) => ({
    id: poi.id,
    name: poi.name,
    position: poi.position,
    category: poi.category,
    importance: poi.importance,
    radius: poi.radius,
  }));

  return {
    version: 1,
    name: world.name,
    entities: {
      npcs,
      mobSpawns,
      resources,
      stations,
      spawnPoints,
      teleports,
      pois,
    },
    metadata: {
      compiledAt: new Date().toISOString(),
      worldSize: world.foundation.config.terrain.worldSize,
      tileSize: world.foundation.config.terrain.tileSize,
    },
  };
}

/**
 * Compile world areas from placements grouped by town/area.
 */
function compileWorldAreas(
  world: WorldData,
  extendedLayers: ExtendedWorldLayers,
): Record<string, unknown> {
  const areas: Record<string, unknown> = {};

  for (const town of world.foundation.towns) {
    const townNpcs = world.layers.npcs
      .filter(
        (n) =>
          n.parentContext.type === "town" && n.parentContext.townId === town.id,
      )
      .map((npc) => ({
        id: npc.npcTypeId,
        name: npc.name,
        position: npc.position,
        storeId: npc.storeId,
        dialogId: npc.dialogId,
      }));

    const townStations = extendedLayers.stations
      .filter((s) => {
        const dx = s.position.x - town.position.x;
        const dz = s.position.z - town.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        return dist < 80; // within ~80m of town center
      })
      .map((s) => ({ type: s.stationType, position: s.position }));

    areas[town.id] = {
      name: town.name,
      position: town.position,
      size: town.size,
      npcs: townNpcs,
      stations: townStations,
    };
  }

  return { starterTowns: areas };
}

/**
 * Compile biomes.json with overrides applied.
 */
function compileBiomes(world: WorldData): unknown[] {
  return world.foundation.biomes.map((biome) => {
    const override = world.layers.biomeOverrides.get(biome.id);
    return {
      id: biome.id,
      type: override?.typeOverride ?? biome.type,
      tileKeys: biome.tileKeys,
      vegetation: override?.vegetationOverride ?? {},
    };
  });
}

/**
 * Compile regions.json from tile-based named regions.
 */
function compileRegions(
  extendedLayers: ExtendedWorldLayers,
): Record<string, unknown> {
  return {
    regions: extendedLayers.regions.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      tileKeys: r.tileKeys,
      tags: r.tags,
      biomeOverride: r.biomeOverride,
      musicTrack: r.musicTrack,
      ambientSound: r.ambientSound,
      spawnRules: r.spawnRules,
      ...(r.autoGenBounds
        ? {
            autoGenBounds: {
              difficultyRange: r.autoGenBounds.difficultyRange,
              biomeFilter: r.autoGenBounds.biomeFilter,
              boundingBox: r.autoGenBounds.boundingBox,
              generationSeed: r.autoGenBounds.generationSeed,
              generatedAt: r.autoGenBounds.generatedAt,
            },
          }
        : {}),
    })),
  };
}

/**
 * Compile danger-sources.json from danger source placements.
 */
function compileDangerSources(
  extendedLayers: ExtendedWorldLayers,
): Record<string, unknown> {
  return {
    sources: extendedLayers.dangerSources.map((ds) => ({
      id: ds.id,
      name: ds.name,
      position: { x: ds.position.x, z: ds.position.z },
      radius: ds.radius,
      intensity: ds.intensity,
      falloffCurve: ds.falloffCurve,
    })),
  };
}

/**
 * Compile wilderness-boundary.json from wilderness boundary polyline.
 */
function compileWildernessBoundary(
  extendedLayers: ExtendedWorldLayers,
): Record<string, unknown> | null {
  const wb = extendedLayers.wildernessBoundary;
  if (!wb) return null;
  return {
    points: wb.points,
    levelScale: wb.levelScale,
    maxLevel: wb.maxLevel,
  };
}

/**
 * Compile music.json from audio layers.
 */
function compileMusic(audioLayers: AudioLayers): Record<string, unknown> {
  return {
    tracks: audioLayers.musicZones.map((mz) => ({
      id: mz.trackId,
      name: mz.name,
      combatTrack: mz.combatTrackId,
      region: {
        polygon: mz.polygon,
        priority: mz.priority,
        blendDistance: mz.blendDistance,
      },
    })),
    ambientZones: audioLayers.ambientZones.map((az) => ({
      id: az.id,
      name: az.name,
      type: az.ambientType,
      tracks: az.tracks,
      polygon: az.polygon,
      volume: az.volume,
      falloffDistance: az.falloffDistance,
    })),
  };
}

/**
 * Compute a diff between compiled manifests and currently deployed manifests.
 */
function computeDiff(
  compiled: CompiledManifests,
  deployed: Record<string, unknown>,
): DeploymentDiff {
  const manifests: ManifestDiffEntry[] = [];
  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;

  for (const entry of MANIFEST_REGISTRY) {
    const compiledData = compiled.files.get(entry.filename);
    const deployedData = deployed[entry.filename];

    if (!compiledData && !deployedData) {
      continue;
    }

    const compiledStr = JSON.stringify(compiledData ?? null);
    const deployedStr = JSON.stringify(deployedData ?? null);

    let changeType: ManifestDiffEntry["changeType"] = "unchanged";
    let entriesAdded = 0;
    let entriesModified = 0;
    let entriesRemoved = 0;

    if (!deployedData && compiledData) {
      changeType = "added";
      entriesAdded = Array.isArray(compiledData) ? compiledData.length : 1;
    } else if (deployedData && !compiledData) {
      changeType = "removed";
      entriesRemoved = Array.isArray(deployedData) ? deployedData.length : 1;
    } else if (compiledStr !== deployedStr) {
      changeType = "modified";
      // Rough estimation: count array length differences
      if (Array.isArray(compiledData) && Array.isArray(deployedData)) {
        entriesAdded = Math.max(0, compiledData.length - deployedData.length);
        entriesRemoved = Math.max(0, deployedData.length - compiledData.length);
        entriesModified = Math.min(compiledData.length, deployedData.length);
      } else {
        entriesModified = 1;
      }
    }

    if (changeType !== "unchanged") {
      totalAdded += entriesAdded;
      totalModified += entriesModified;
      totalRemoved += entriesRemoved;

      const parts: string[] = [];
      if (entriesAdded > 0) parts.push(`${entriesAdded} added`);
      if (entriesModified > 0) parts.push(`${entriesModified} modified`);
      if (entriesRemoved > 0) parts.push(`${entriesRemoved} removed`);

      manifests.push({
        filename: entry.filename,
        category: entry.category,
        changeType,
        entriesAdded,
        entriesModified,
        entriesRemoved,
        summary: parts.join(", ") || changeType,
      });
    }
  }

  return {
    manifests,
    assetChanges: [], // TODO: track asset file changes
    totalAdded,
    totalModified,
    totalRemoved,
  };
}

export function useManifestCompiler() {
  /**
   * Compile all world data into deployable manifest files.
   */
  const compile = useCallback(
    (
      world: WorldData,
      extendedLayers: ExtendedWorldLayers,
      audioLayers: AudioLayers,
      manifests: ManifestData,
      _brushOverlays: BrushOverlays,
    ): CompiledManifests => {
      const files = new Map<string, unknown>();

      // world.json — entity spawn definitions (separate from manifests)
      const worldJson = compileWorldJson(world, extendedLayers);

      // world-areas.json
      files.set("world-areas.json", compileWorldAreas(world, extendedLayers));

      // biomes.json
      files.set("biomes.json", compileBiomes(world));

      // music.json
      files.set("music.json", compileMusic(audioLayers));

      // regions.json
      if (extendedLayers.regions.length > 0) {
        files.set("regions.json", compileRegions(extendedLayers));
      }

      // danger-sources.json
      if (extendedLayers.dangerSources.length > 0) {
        files.set("danger-sources.json", compileDangerSources(extendedLayers));
      }

      // wilderness-boundary.json
      const wb = compileWildernessBoundary(extendedLayers);
      if (wb) {
        files.set("wilderness-boundary.json", wb);
      }

      // Pass through manifest data that was loaded from server
      // (items, quests, npcs, etc. may have been edited via manifest browser)
      if (manifests.rawManifests) {
        for (const [name, content] of Object.entries(manifests.rawManifests)) {
          if (content != null) {
            files.set(name, content);
          }
        }
      }

      return { files, worldJson };
    },
    [],
  );

  /**
   * Compute diff between compiled state and currently deployed state.
   */
  const diff = useCallback(
    (
      compiled: CompiledManifests,
      deployed: Record<string, unknown>,
    ): DeploymentDiff => {
      return computeDiff(compiled, deployed);
    },
    [],
  );

  return { compile, diff };
}
