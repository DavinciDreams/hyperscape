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
import type { WorldCreationConfig } from "../../WorldBuilder/types";
import { generateWorldFromConfig } from "../../WorldBuilder/worldGeneration";
import {
  getWorldProject,
  saveWorldProject,
  acquireProjectLock,
  releaseProjectLock,
} from "../../../utils/worldProjectApi";
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
