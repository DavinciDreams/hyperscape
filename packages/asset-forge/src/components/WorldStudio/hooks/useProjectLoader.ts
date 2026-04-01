/**
 * useProjectLoader — Load a world project from the server on mount
 *
 * Fetches project data, deserializes world, sets context state,
 * acquires edit lock, and releases lock on unmount.
 */

import { useEffect, useRef } from "react";

import {
  deserializeWorld,
  serializeWorld,
} from "../../WorldBuilder/utils/worldPersistence";
import {
  DEFAULT_CREATION_CONFIG,
  DEFAULT_NOISE_CONFIG,
  DEFAULT_BIOME_CONFIG,
  DEFAULT_ISLAND_CONFIG,
  DEFAULT_SHORELINE_CONFIG,
  DEFAULT_TOWN_CONFIG,
  DEFAULT_ROAD_CONFIG,
} from "../../WorldBuilder/types";
import type { WorldCreationConfig, WorldData } from "../../WorldBuilder/types";
import { generateWorldFromConfig } from "../../WorldBuilder/worldGeneration";
import { BiomeSystem } from "@hyperscape/procgen/terrain";
import { GAME_BIOME_DEFINITIONS } from "../../WorldBuilder/GameTerrainAdapter";
import {
  getWorldProject,
  saveWorldProject,
  acquireProjectLock,
  releaseProjectLock,
} from "../../../utils/worldProjectApi";
import {
  deserializeManifestOverrides,
  type SerializedManifestOverrides,
} from "../types";
import { useWorldStudio } from "../WorldStudioContext";

/**
 * Config matching the live Hyperscape game world.
 * Seed 0, 100x100 tiles (10km x 10km), uses the game's exact terrain pipeline.
 */
const HYPERSCAPE_GAME_WORLD_CONFIG: WorldCreationConfig = {
  seed: 0,
  preset: null,
  useGamePipeline: true,
  terrain: {
    tileSize: 100,
    worldSize: 100,
    tileResolution: 64,
    maxHeight: 50,
    waterThreshold: 8.0,
  },
  noise: DEFAULT_NOISE_CONFIG,
  biomes: DEFAULT_BIOME_CONFIG,
  island: DEFAULT_ISLAND_CONFIG,
  shoreline: DEFAULT_SHORELINE_CONFIG,
  towns: DEFAULT_TOWN_CONFIG,
  roads: DEFAULT_ROAD_CONFIG,
};

/**
 * Ensure biomes exist and have tileKeys populated.
 * Worlds saved before the biome generation fix may have an empty biomes array
 * or biomes with empty tileKeys. This regenerates/backfills as needed.
 */
function repairBiomes(world: WorldData): void {
  const config = world.foundation.config;
  const { worldSize, tileSize } = config.terrain;
  const worldSizeMeters = worldSize * tileSize;

  // If no biomes at all, regenerate from config
  if (world.foundation.biomes.length === 0) {
    const biomeConfig = config.biomes ?? DEFAULT_BIOME_CONFIG;
    const biomeSystem = new BiomeSystem(
      config.seed,
      worldSizeMeters,
      biomeConfig,
      GAME_BIOME_DEFINITIONS,
    );
    const centers = biomeSystem.getBiomeCenters();
    world.foundation.biomes = centers.map((center, index) => {
      const def = biomeSystem.getBiomeDefinition(center.type);
      return {
        id: `biome-${index}`,
        type: center.type,
        center: {
          x: center.x + worldSizeMeters / 2,
          y: 0,
          z: center.z + worldSizeMeters / 2,
        },
        influenceRadius: center.influence,
        tileKeys: [],
        color: def.color,
      };
    });
  }

  // Backfill tileKeys if all empty
  const biomes = world.foundation.biomes;
  if (biomes.length === 0) return;
  const allEmpty = biomes.every((b) => b.tileKeys.length === 0);
  if (!allEmpty) return;

  for (let tx = 0; tx < worldSize; tx++) {
    for (let tz = 0; tz < worldSize; tz++) {
      const wx = tx * tileSize;
      const wz = tz * tileSize;
      let closest = biomes[0];
      let closestDist = Infinity;
      for (const biome of biomes) {
        const dx = wx - biome.center.x;
        const dz = wz - biome.center.z;
        const dist = dx * dx + dz * dz;
        if (dist < closestDist) {
          closestDist = dist;
          closest = biome;
        }
      }
      closest.tileKeys.push(`${tx},${tz}`);
    }
  }
}

export function useProjectLoader(projectId: string) {
  const { actions } = useWorldStudio();
  const lockAcquiredRef = useRef(false);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      actions.loadStart();
      try {
        const project = await getWorldProject(projectId);
        if (cancelled) return;

        // Check if this is a placeholder project (created at signup, no world data yet)
        const rawData = project.worldData as Record<string, unknown>;
        let world;
        if (rawData?._placeholder) {
          // Generate the Hyperscape game world on first open
          const generated = await new Promise<
            ReturnType<typeof generateWorldFromConfig>
          >((resolve, reject) => {
            setTimeout(() => {
              try {
                resolve(generateWorldFromConfig(HYPERSCAPE_GAME_WORLD_CONFIG));
              } catch (err) {
                reject(err);
              }
            }, 50);
          });
          if (cancelled) return;
          world = generated;
          // Persist so next load is instant
          const serialized = serializeWorld(generated);
          saveWorldProject(project.id, { worldData: serialized }).catch((err) =>
            console.error(
              "[ProjectLoader] Failed to save generated world:",
              err,
            ),
          );
        } else {
          world = deserializeWorld(
            rawData as unknown as Parameters<typeof deserializeWorld>[0],
          );
        }

        // Repair biomes for worlds saved before the biome generation fix
        repairBiomes(world);

        // Set project context
        actions.setProject(
          project.teamId,
          project.gameId,
          project.id,
          project.name,
          project.version,
        );

        // Load world into editing state
        actions.loadWorld(world);
        actions.switchToEditing();
        actions.loadSuccess();

        // Restore manifest overrides from snapshot
        if (project.manifestSnapshot) {
          try {
            actions.loadManifestOverrides(
              deserializeManifestOverrides(
                project.manifestSnapshot as SerializedManifestOverrides,
              ),
            );
          } catch (e) {
            console.warn(
              "[ProjectLoader] Failed to restore manifest overrides:",
              e,
            );
          }
        }

        // Acquire edit lock
        try {
          const lockResult = await acquireProjectLock(projectId);
          if (!cancelled && lockResult.success) {
            lockAcquiredRef.current = true;
            actions.setProjectLock(lockResult.lockedBy ?? null);
          }
        } catch {
          // Lock failure is non-fatal — user can still view
        }
      } catch (err) {
        if (!cancelled) {
          actions.loadError(
            err instanceof Error ? err.message : "Failed to load project",
          );
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      // Release lock on unmount
      if (lockAcquiredRef.current) {
        lockAcquiredRef.current = false;
        releaseProjectLock(projectIdRef.current).catch(() => {
          // Best-effort lock release
        });
      }
    };
  }, [projectId, actions]);
}
