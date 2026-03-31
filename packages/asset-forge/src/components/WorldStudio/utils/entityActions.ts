/**
 * entityActions — Shared entity action maps and helpers for World Studio.
 *
 * Used by shortcuts, context menus, outliner, and viewport to uniformly
 * duplicate, delete, and find entity data across all entity types.
 */

import type { useWorldStudio } from "../WorldStudioContext";
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

export const ENTITY_ACTIONS: Record<string, { remove: string; add: string }> = {
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
    default:
      return null;
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
): boolean {
  const entityActions = ENTITY_ACTIONS[entityType];
  if (!entityActions) return false;

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
): boolean {
  const entityActions = ENTITY_ACTIONS[entityType];
  if (!entityActions) return false;

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
