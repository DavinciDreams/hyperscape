/**
 * entityActions — Shared entity action maps and helpers for World Studio.
 *
 * Used by shortcuts, context menus, outliner, and viewport to uniformly
 * duplicate, delete, and find entity data across all entity types.
 */

import type { useWorldStudio } from "../WorldStudioContext";
import type { Prefab, PrefabEntry, PrefabEntityType } from "../types";
import type { WorldPosition } from "../../WorldBuilder/types";
import type { WorldStudioAction } from "../worldStudioTypes";
import type { EntityTypeRegistry } from "../../../gameModules/EntityTypeRegistry";
import {
  commandHistory,
  DuplicateEntityCommand,
  DeleteEntityCommand,
  type DuplicateEntityTarget,
  type DeleteEntityTarget,
} from "../../../editor/commands";

// ---------------------------------------------------------------------------
// Action name map — maps selection type → context action names
// ---------------------------------------------------------------------------

const ENTITY_ACTIONS: Record<string, { remove: string; add: string }> = {
  npc: { remove: "removeNPC", add: "addNPC" },
  quest: { remove: "removeQuest", add: "addQuest" },
  boss: { remove: "removeBoss", add: "addBoss" },
  event: { remove: "removeEvent", add: "addEvent" },
  lore: { remove: "removeLore", add: "addLore" },
  difficultyZone: { remove: "removeDifficultyZone", add: "addDifficultyZone" },
  customPlacement: {
    remove: "removeCustomPlacement",
    add: "addCustomPlacement",
  },
  spawnPoint: { remove: "removeSpawnPoint", add: "addSpawnPoint" },
  teleport: { remove: "removeTeleport", add: "addTeleport" },
  mobSpawn: { remove: "removeMobSpawn", add: "addMobSpawn" },
  resource: { remove: "removeResource", add: "addResource" },
  station: { remove: "removeStation", add: "addStation" },
  poi: { remove: "removePOI", add: "addPOI" },
  waterBody: { remove: "removeWaterBody", add: "addWaterBody" },
  musicZone: { remove: "removeMusicZone", add: "addMusicZone" },
  ambientZone: { remove: "removeAmbientZone", add: "addAmbientZone" },
  sfxTrigger: { remove: "removeSFXTrigger", add: "addSFXTrigger" },
  region: { remove: "removeRegion", add: "addRegion" },
  dangerSource: { remove: "removeDangerSource", add: "addDangerSource" },
  customAsset: { remove: "removeCustomAsset", add: "addCustomAsset" },
  prefab: { remove: "removePrefab", add: "addPrefab" },
};

// ---------------------------------------------------------------------------
// State type alias for brevity
// ---------------------------------------------------------------------------

type StudioState = ReturnType<typeof useWorldStudio>["state"];
type StudioActions = ReturnType<typeof useWorldStudio>["actions"];

// ---------------------------------------------------------------------------
// Find entity data by type + id
// ---------------------------------------------------------------------------

export function findEntityData(
  state: StudioState,
  type: string,
  id: string,
): Record<string, unknown> | null {
  const ext = state.extendedLayers;
  const audio = state.audioLayers;
  const world = state.builder.editing.world;

  switch (type) {
    case "spawnPoint":
      return (
        (ext.spawnPoints.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "teleport":
      return (
        (ext.teleports.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "mobSpawn":
      return (
        (ext.mobSpawns.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "resource":
      return (
        (ext.resources.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "station":
      return (
        (ext.stations.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "poi":
      return (
        (ext.pois.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "waterBody":
      return (
        (ext.waterBodies.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "musicZone":
      return (
        (audio.musicZones.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "ambientZone":
      return (
        (audio.ambientZones.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "sfxTrigger":
      return (
        (audio.sfxTriggers.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "region":
      return (
        (ext.regions.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "dangerSource":
      return (
        (ext.dangerSources.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "customAsset":
      return (
        (ext.customAssets.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "prefab":
      return (
        (state.prefabs.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "npc":
      return (
        (world?.layers.npcs.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "quest":
      return (
        (world?.layers.quests.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    case "boss":
      return (
        (world?.layers.bosses.find((e) => e.id === id) as
          | Record<string, unknown>
          | undefined) ?? null
      );
    default: {
      // Registry fallback for dynamic module entity types
      // Try to find entity in generic state arrays by selection type
      for (const key of Object.keys(ext)) {
        const arr = ext[key as keyof typeof ext];
        if (Array.isArray(arr)) {
          const found = (arr as Array<{ id: string }>).find((e) => e.id === id);
          if (found) return found as Record<string, unknown>;
        }
      }
      // Then audioLayers
      for (const key of Object.keys(audio)) {
        const arr = audio[key as keyof typeof audio];
        if (Array.isArray(arr)) {
          const found = (arr as Array<{ id: string }>).find((e) => e.id === id);
          if (found) return found as Record<string, unknown>;
        }
      }
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Execute duplicate via command history
// ---------------------------------------------------------------------------

export function executeDuplicate(
  state: StudioState,
  actions: StudioActions,
  entityType: string,
  entityId: string,
  registry?: EntityTypeRegistry,
  dispatch?: (action: WorldStudioAction) => void,
): boolean {
  const entityActions = ENTITY_ACTIONS[entityType];

  // Registry fallback for dynamic module entity types
  if (!entityActions) {
    if (!registry || !dispatch) return false;
    const schema = registry.getBySelectionType(entityType);
    if (!schema) return false;

    const entityData = findEntityData(state, entityType, entityId);
    if (!entityData) return false;

    const { stateKey, stateRoot } = schema.storage;
    const target: DuplicateEntityTarget = {
      entityType,
      entityData,
      onPlace: (data) =>
        dispatch({
          type: "ENTITY_ADD",
          stateKey,
          stateRoot,
          entity: data as { id: string } & Record<string, unknown>,
        }),
      onRemove: (id) =>
        dispatch({ type: "ENTITY_REMOVE", stateKey, stateRoot, id }),
    };

    commandHistory.execute(new DuplicateEntityCommand(target));
    return true;
  }

  const entityData = findEntityData(state, entityType, entityId);
  if (!entityData) return false;

  const actionsObj = actions as unknown as Record<
    string,
    (...args: unknown[]) => void
  >;
  const addAction = actionsObj[entityActions.add];
  const removeAction = actionsObj[entityActions.remove];
  if (!addAction || !removeAction) return false;

  const target: DuplicateEntityTarget = {
    entityType,
    entityData,
    onPlace: (data) => addAction(data),
    onRemove: (id) => removeAction(id),
  };

  commandHistory.execute(new DuplicateEntityCommand(target));
  return true;
}

// ---------------------------------------------------------------------------
// Execute delete via command history
// ---------------------------------------------------------------------------

export function executeDelete(
  state: StudioState,
  actions: StudioActions,
  entityType: string,
  entityId: string,
  registry?: EntityTypeRegistry,
  dispatch?: (action: WorldStudioAction) => void,
): boolean {
  const entityActions = ENTITY_ACTIONS[entityType];

  // Registry fallback for dynamic module entity types
  if (!entityActions) {
    if (!registry || !dispatch) return false;
    const schema = registry.getBySelectionType(entityType);
    if (!schema) return false;

    const entityData = findEntityData(state, entityType, entityId);
    if (!entityData) return false;

    const { stateKey, stateRoot } = schema.storage;
    const target: DeleteEntityTarget = {
      entityType,
      entityData,
      onDelete: (id) =>
        dispatch({ type: "ENTITY_REMOVE", stateKey, stateRoot, id }),
      onRestore: (data) =>
        dispatch({
          type: "ENTITY_ADD",
          stateKey,
          stateRoot,
          entity: data as { id: string } & Record<string, unknown>,
        }),
    };

    commandHistory.execute(new DeleteEntityCommand(entityId, target));
    actions.setSelection(null);
    return true;
  }

  const entityData = findEntityData(state, entityType, entityId);
  if (!entityData) return false;

  const actionsObj = actions as unknown as Record<
    string,
    (...args: unknown[]) => void
  >;
  const removeAction = actionsObj[entityActions.remove];
  const addAction = actionsObj[entityActions.add];
  if (!removeAction || !addAction) return false;

  const target: DeleteEntityTarget = {
    entityType,
    entityData,
    onDelete: (id) => removeAction(id),
    onRestore: (data) => addAction(data),
  };

  commandHistory.execute(new DeleteEntityCommand(entityId, target));
  actions.setSelection(null);
  return true;
}

// ---------------------------------------------------------------------------
// Create prefab from selected entities
// ---------------------------------------------------------------------------

/** Valid entity types that can be stored in prefabs (mirrors PrefabEntityType). */
const PREFAB_ENTITY_TYPES = new Set<string>([
  "npc",
  "spawnPoint",
  "teleport",
  "mobSpawn",
  "resource",
  "station",
  "poi",
  "waterBody",
  "musicZone",
  "ambientZone",
  "sfxTrigger",
  "region",
  "dangerSource",
  "customAsset",
]);

/** Validate a position has finite numeric coordinates. */
function isValidPosition(pos: unknown): pos is WorldPosition {
  if (!pos || typeof pos !== "object") return false;
  const p = pos as Record<string, unknown>;
  return (
    typeof p.x === "number" &&
    isFinite(p.x) &&
    typeof p.z === "number" &&
    isFinite(p.z)
  );
}

/**
 * Create a prefab from one or more selected entities.
 * Entities are stored with positions relative to the group centroid.
 * Returns the created prefab name on success, or null on failure.
 */
export function executeCreatePrefab(
  state: StudioState,
  actions: StudioActions,
  selections: Array<{ type: string; id: string }>,
): string | null {
  if (selections.length === 0) return null;

  // Collect entity data for all selections
  const collected: Array<{
    type: PrefabEntityType;
    id: string;
    data: Record<string, unknown>;
  }> = [];

  for (const sel of selections) {
    if (!ENTITY_ACTIONS[sel.type] || !PREFAB_ENTITY_TYPES.has(sel.type)) {
      console.warn(`[Prefab] Unsupported entity type: "${sel.type}"`);
      continue;
    }
    const data = findEntityData(state, sel.type, sel.id);
    if (!data) {
      console.warn(`[Prefab] Entity not found: ${sel.type}/${sel.id}`);
      continue;
    }
    collected.push({ type: sel.type as PrefabEntityType, id: sel.id, data });
  }

  if (collected.length === 0) return null;

  // Compute centroid from entity positions
  let cx = 0;
  let cz = 0;
  let posCount = 0;
  for (const c of collected) {
    const pos = c.data.position;
    if (isValidPosition(pos)) {
      cx += pos.x;
      cz += pos.z;
      posCount++;
    }
  }
  if (posCount > 0) {
    cx /= posCount;
    cz /= posCount;
  }

  // Build prefab entries with relative offsets
  const entries: PrefabEntry[] = collected.map((c) => {
    const pos = isValidPosition(c.data.position)
      ? (c.data.position as WorldPosition)
      : null;
    return {
      entityType: c.type,
      templateId: (c.data.templateId as string) ?? c.id,
      name: (c.data.name as string) ?? c.type,
      offset: {
        x: pos ? pos.x - cx : 0,
        y: (pos as WorldPosition | null)?.y ?? 0,
        z: pos ? pos.z - cz : 0,
      },
      rotation: (c.data.rotation as number) ?? 0,
      data: structuredClone(c.data),
    };
  });

  const prefab: Prefab = {
    id: `prefab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: `Prefab (${entries.length} entities)`,
    description: entries.map((e) => e.name).join(", "),
    entries,
    createdAt: Date.now(),
  };

  actions.addPrefab(prefab);
  return prefab.name;
}
