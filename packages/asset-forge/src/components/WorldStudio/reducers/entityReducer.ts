/**
 * Entity sub-reducer — handles all entity CRUD actions on extendedLayers.
 *
 * Extracted from WorldStudioContext.tsx to reduce file size.
 * Covers: NPCs, spawn points, teleports, mob spawns, resources, stations,
 * POIs, water bodies, mines, wilderness boundary, batch entity ops, and
 * game entity data.
 */

import type { WorldStudioState, WorldStudioAction } from "../worldStudioTypes";

/** Handle entity-related actions. Returns the new state, or null if unhandled. */
export function entityReducer(
  state: WorldStudioState,
  action: WorldStudioAction,
): WorldStudioState | null {
  switch (action.type) {
    // Extended layer entity actions — NPCs
    case "ADD_NPC":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          npcs: [...state.extendedLayers.npcs, action.npc],
        },
      };

    case "UPDATE_NPC":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          npcs: state.extendedLayers.npcs.map((n) =>
            n.id === action.npcId ? { ...n, ...action.updates } : n,
          ),
        },
      };

    case "REMOVE_NPC":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          npcs: state.extendedLayers.npcs.filter((n) => n.id !== action.npcId),
        },
      };

    // Extended layer entity actions — Spawn Points
    case "ADD_SPAWN_POINT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          spawnPoints: [...state.extendedLayers.spawnPoints, action.spawnPoint],
        },
      };

    case "UPDATE_SPAWN_POINT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          spawnPoints: state.extendedLayers.spawnPoints.map((sp) =>
            sp.id === action.id ? { ...sp, ...action.updates } : sp,
          ),
        },
      };

    case "REMOVE_SPAWN_POINT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          spawnPoints: state.extendedLayers.spawnPoints.filter(
            (sp) => sp.id !== action.id,
          ),
        },
      };

    // Extended layer entity actions — Teleports
    case "ADD_TELEPORT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          teleports: [...state.extendedLayers.teleports, action.teleport],
        },
      };

    case "UPDATE_TELEPORT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          teleports: state.extendedLayers.teleports.map((tp) =>
            tp.id === action.id ? { ...tp, ...action.updates } : tp,
          ),
        },
      };

    case "REMOVE_TELEPORT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          teleports: state.extendedLayers.teleports.filter(
            (tp) => tp.id !== action.id,
          ),
        },
      };

    // Extended layer entity actions — Mob Spawns
    case "ADD_MOB_SPAWN":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mobSpawns: [...state.extendedLayers.mobSpawns, action.mobSpawn],
        },
      };

    case "UPDATE_MOB_SPAWN":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mobSpawns: state.extendedLayers.mobSpawns.map((ms) =>
            ms.id === action.id
              ? {
                  ...ms,
                  ...action.updates,
                  source:
                    ms.source === "procgen"
                      ? ("hand-placed" as const)
                      : ms.source,
                }
              : ms,
          ),
        },
      };

    case "REMOVE_MOB_SPAWN":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mobSpawns: state.extendedLayers.mobSpawns.filter(
            (ms) => ms.id !== action.id,
          ),
        },
      };

    // Extended layer entity actions — Resources
    case "ADD_RESOURCE":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          resources: [...state.extendedLayers.resources, action.resource],
        },
      };

    case "UPDATE_RESOURCE":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          resources: state.extendedLayers.resources.map((r) =>
            r.id === action.id
              ? {
                  ...r,
                  ...action.updates,
                  source:
                    r.source === "procgen"
                      ? ("hand-placed" as const)
                      : r.source,
                }
              : r,
          ),
        },
      };

    case "REMOVE_RESOURCE":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          resources: state.extendedLayers.resources.filter(
            (r) => r.id !== action.id,
          ),
        },
      };

    // Extended layer entity actions — Stations
    case "ADD_STATION":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          stations: [...state.extendedLayers.stations, action.station],
        },
      };

    case "UPDATE_STATION":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          stations: state.extendedLayers.stations.map((s) =>
            s.id === action.id
              ? {
                  ...s,
                  ...action.updates,
                  source:
                    s.source === "procgen"
                      ? ("hand-placed" as const)
                      : s.source,
                }
              : s,
          ),
        },
      };

    case "REMOVE_STATION":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          stations: state.extendedLayers.stations.filter(
            (s) => s.id !== action.id,
          ),
        },
      };

    // Extended layer entity actions — POIs
    case "ADD_POI":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          pois: [...state.extendedLayers.pois, action.poi],
        },
      };

    case "UPDATE_POI":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          pois: state.extendedLayers.pois.map((p) =>
            p.id === action.id ? { ...p, ...action.updates } : p,
          ),
        },
      };

    case "REMOVE_POI":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          pois: state.extendedLayers.pois.filter((p) => p.id !== action.id),
        },
      };

    // Extended layer entity actions — Water Bodies
    case "ADD_WATER_BODY":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          waterBodies: [...state.extendedLayers.waterBodies, action.waterBody],
        },
      };

    case "UPDATE_WATER_BODY":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          waterBodies: state.extendedLayers.waterBodies.map((w) =>
            w.id === action.id ? { ...w, ...action.updates } : w,
          ),
        },
      };

    case "REMOVE_WATER_BODY":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          waterBodies: state.extendedLayers.waterBodies.filter(
            (w) => w.id !== action.id,
          ),
        },
      };

    // Wilderness Boundary
    case "SET_WILDERNESS_BOUNDARY":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          wildernessBoundary: action.boundary,
        },
      };

    // Batch actions for auto-generation — entities
    case "BATCH_ADD_ENTITIES": {
      const newMobs = [...state.extendedLayers.mobSpawns, ...action.mobSpawns];
      const newRes = [...state.extendedLayers.resources, ...action.resources];
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mobSpawns: newMobs,
          resources: newRes,
        },
      };
    }

    case "BATCH_ADD_MINES":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mines: [...state.extendedLayers.mines, ...action.mines],
        },
      };

    case "ADD_MINE":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mines: [...state.extendedLayers.mines, action.mine],
        },
      };

    case "REMOVE_MINE":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mines: state.extendedLayers.mines.filter((m) => m.id !== action.id),
        },
      };

    case "CLEAR_ALL_AUTOGEN":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          regions: state.extendedLayers.regions.filter((r) => !r.autoGenBounds),
          mobSpawns: state.extendedLayers.mobSpawns.filter(
            (m) => m.source !== "procgen" || !m.id.startsWith("autogen-"),
          ),
          resources: state.extendedLayers.resources.filter(
            (r) => r.source !== "procgen" || !r.id.startsWith("autogen-"),
          ),
          spawnPoints: state.extendedLayers.spawnPoints.filter(
            (sp) => !sp.id.startsWith("autogen-"),
          ),
          teleports: state.extendedLayers.teleports.filter(
            (tp) => !tp.id.startsWith("autogen-"),
          ),
          mines: state.extendedLayers.mines.filter(
            (m) => m.source !== "procgen",
          ),
        },
      };

    // Game entity data from manifest
    case "SET_GAME_ENTITIES":
      return {
        ...state,
        gameEntities: action.data,
      };

    // Phase 9.1: Custom Asset CRUD
    case "ADD_CUSTOM_ASSET":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          customAssets: [...state.extendedLayers.customAssets, action.asset],
        },
      };
    case "UPDATE_CUSTOM_ASSET":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          customAssets: state.extendedLayers.customAssets.map((a) =>
            a.id === action.id ? { ...a, ...action.updates } : a,
          ),
        },
      };
    case "REMOVE_CUSTOM_ASSET":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          customAssets: state.extendedLayers.customAssets.filter(
            (a) => a.id !== action.id,
          ),
        },
      };

    // Phase 9.2: Prefab CRUD
    case "ADD_PREFAB":
      return {
        ...state,
        prefabs: [...state.prefabs, action.prefab],
      };
    case "UPDATE_PREFAB":
      return {
        ...state,
        prefabs: state.prefabs.map((p) =>
          p.id === action.id ? { ...p, ...action.updates } : p,
        ),
      };
    case "REMOVE_PREFAB":
      return {
        ...state,
        prefabs: state.prefabs.filter((p) => p.id !== action.id),
      };

    // Bulk restore actions (project load persistence)
    case "RESTORE_EXTENDED_LAYERS":
      return { ...state, extendedLayers: action.layers };
    case "RESTORE_AUDIO_LAYERS":
      return { ...state, audioLayers: action.layers };
    case "RESTORE_PREFABS":
      return { ...state, prefabs: action.prefabs };

    default:
      return null;
  }
}
