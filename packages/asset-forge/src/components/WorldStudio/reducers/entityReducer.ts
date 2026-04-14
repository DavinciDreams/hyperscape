/**
 * Entity sub-reducer — handles all entity CRUD actions on extendedLayers.
 *
 * Uses a factory pattern for the repetitive ADD/UPDATE/REMOVE triplets,
 * with explicit handling for special cases (source tracking, batch ops, etc.).
 */

import type { WorldStudioState, WorldStudioAction } from "../worldStudioTypes";

// ---------------------------------------------------------------------------
// Generic CRUD helpers
// ---------------------------------------------------------------------------

type HasId = { id: string };

/** Immutable append to an extendedLayers array. */
function addEntity<K extends keyof WorldStudioState["extendedLayers"]>(
  state: WorldStudioState,
  key: K,
  entity: WorldStudioState["extendedLayers"][K] extends Array<infer T>
    ? T
    : never,
): WorldStudioState {
  const arr = state.extendedLayers[key] as unknown[];
  return {
    ...state,
    extendedLayers: { ...state.extendedLayers, [key]: [...arr, entity] },
  };
}

/** Immutable update by id within an extendedLayers array. */
function updateEntity<K extends keyof WorldStudioState["extendedLayers"]>(
  state: WorldStudioState,
  key: K,
  id: string,
  updates: Record<string, unknown>,
): WorldStudioState {
  const arr = state.extendedLayers[key] as HasId[];
  return {
    ...state,
    extendedLayers: {
      ...state.extendedLayers,
      [key]: arr.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    },
  };
}

/** Immutable update that also promotes procgen→hand-placed source. */
function updateEntityWithSource<
  K extends keyof WorldStudioState["extendedLayers"],
>(
  state: WorldStudioState,
  key: K,
  id: string,
  updates: Record<string, unknown>,
): WorldStudioState {
  const arr = state.extendedLayers[key] as Array<HasId & { source?: string }>;
  return {
    ...state,
    extendedLayers: {
      ...state.extendedLayers,
      [key]: arr.map((e) =>
        e.id === id
          ? {
              ...e,
              ...updates,
              source:
                e.source === "procgen" ? ("hand-placed" as const) : e.source,
            }
          : e,
      ),
    },
  };
}

/** Immutable remove by id from an extendedLayers array. */
function removeEntity<K extends keyof WorldStudioState["extendedLayers"]>(
  state: WorldStudioState,
  key: K,
  id: string,
): WorldStudioState {
  const arr = state.extendedLayers[key] as HasId[];
  return {
    ...state,
    extendedLayers: {
      ...state.extendedLayers,
      [key]: arr.filter((e) => e.id !== id),
    },
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/** Handle entity-related actions. Returns the new state, or null if unhandled. */
export function entityReducer(
  state: WorldStudioState,
  action: WorldStudioAction,
): WorldStudioState | null {
  switch (action.type) {
    // --- Simple CRUD: NPCs ---
    case "ADD_NPC":
      return addEntity(state, "npcs", action.npc);
    case "UPDATE_NPC":
      return updateEntity(state, "npcs", action.npcId, action.updates);
    case "REMOVE_NPC":
      return removeEntity(state, "npcs", action.npcId);

    // --- Simple CRUD: Spawn Points ---
    case "ADD_SPAWN_POINT":
      return addEntity(state, "spawnPoints", action.spawnPoint);
    case "UPDATE_SPAWN_POINT":
      return updateEntity(state, "spawnPoints", action.id, action.updates);
    case "REMOVE_SPAWN_POINT":
      return removeEntity(state, "spawnPoints", action.id);

    // --- Simple CRUD: Teleports ---
    case "ADD_TELEPORT":
      return addEntity(state, "teleports", action.teleport);
    case "UPDATE_TELEPORT":
      return updateEntity(state, "teleports", action.id, action.updates);
    case "REMOVE_TELEPORT":
      return removeEntity(state, "teleports", action.id);

    // --- Source-tracking CRUD: Mob Spawns ---
    case "ADD_MOB_SPAWN":
      return addEntity(state, "mobSpawns", action.mobSpawn);
    case "UPDATE_MOB_SPAWN":
      return updateEntityWithSource(
        state,
        "mobSpawns",
        action.id,
        action.updates,
      );
    case "REMOVE_MOB_SPAWN":
      return removeEntity(state, "mobSpawns", action.id);

    // --- Source-tracking CRUD: Resources ---
    case "ADD_RESOURCE":
      return addEntity(state, "resources", action.resource);
    case "UPDATE_RESOURCE":
      return updateEntityWithSource(
        state,
        "resources",
        action.id,
        action.updates,
      );
    case "REMOVE_RESOURCE":
      return removeEntity(state, "resources", action.id);

    // --- Source-tracking CRUD: Stations ---
    case "ADD_STATION":
      return addEntity(state, "stations", action.station);
    case "UPDATE_STATION":
      return updateEntityWithSource(
        state,
        "stations",
        action.id,
        action.updates,
      );
    case "REMOVE_STATION":
      return removeEntity(state, "stations", action.id);

    // --- Simple CRUD: POIs ---
    case "ADD_POI":
      return addEntity(state, "pois", action.poi);
    case "UPDATE_POI":
      return updateEntity(state, "pois", action.id, action.updates);
    case "REMOVE_POI":
      return removeEntity(state, "pois", action.id);

    // --- Simple CRUD: Water Bodies ---
    case "ADD_WATER_BODY":
      return addEntity(state, "waterBodies", action.waterBody);
    case "UPDATE_WATER_BODY":
      return updateEntity(state, "waterBodies", action.id, action.updates);
    case "REMOVE_WATER_BODY":
      return removeEntity(state, "waterBodies", action.id);

    // --- Mines (ADD + REMOVE + batch) ---
    case "ADD_MINE":
      return addEntity(state, "mines", action.mine);
    case "REMOVE_MINE":
      return removeEntity(state, "mines", action.id);
    case "BATCH_ADD_MINES":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mines: [...state.extendedLayers.mines, ...action.mines],
        },
      };

    // --- Custom Assets ---
    case "ADD_CUSTOM_ASSET":
      return addEntity(state, "customAssets", action.asset);
    case "UPDATE_CUSTOM_ASSET":
      return updateEntity(state, "customAssets", action.id, action.updates);
    case "REMOVE_CUSTOM_ASSET":
      return removeEntity(state, "customAssets", action.id);

    // --- Wilderness Boundary (scalar, not array CRUD) ---
    case "SET_WILDERNESS_BOUNDARY":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          wildernessBoundary: action.boundary,
        },
      };

    // --- Batch entity operations ---
    case "BATCH_ADD_ENTITIES":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mobSpawns: [...state.extendedLayers.mobSpawns, ...action.mobSpawns],
          resources: [...state.extendedLayers.resources, ...action.resources],
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

    // --- Prefabs (on state.prefabs, not extendedLayers) ---
    case "ADD_PREFAB":
      return { ...state, prefabs: [...state.prefabs, action.prefab] };
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

    // --- Game entity data ---
    case "SET_GAME_ENTITIES":
      return { ...state, gameEntities: action.data };

    // --- Bulk restore (project load) ---
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
