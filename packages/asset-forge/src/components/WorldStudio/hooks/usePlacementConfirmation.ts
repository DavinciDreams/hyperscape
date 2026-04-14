/**
 * usePlacementConfirmation — Creates entities when placement is confirmed
 *
 * Watches for the `confirmed` flag on activePlacement and dispatches
 * the appropriate ADD_* action to create the entity in extended layers.
 * After creation, clears the placement (or starts a new one for rapid placement).
 */

import { useEffect, useRef } from "react";

import {
  commandHistory,
  PlaceEntityCommand,
  PlacePrefabCommand,
  type PlacePrefabEntry,
} from "../../../editor/commands";
import { useWorldStudio } from "../WorldStudioContext";
import { getPlacementYOffset } from "./useEditorWorldSync";

let nextEntityId = 1;
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${nextEntityId++}`;
}

// ============== PLACEMENT PRESETS (module-scope to avoid per-click allocation) ==============

const DANGER_PRESETS: Record<
  string,
  { intensity: number; radius: number; falloffCurve: number }
> = {
  "danger-dark-wizard": { intensity: 2, radius: 40, falloffCurve: 1.5 },
  "danger-spider-nest": { intensity: 1.5, radius: 30, falloffCurve: 2 },
  "danger-weak": { intensity: 0.5, radius: 60, falloffCurve: 1 },
  "danger-strong": { intensity: 3, radius: 50, falloffCurve: 1.2 },
};
const DANGER_DEFAULT = { intensity: 1, radius: 30, falloffCurve: 1.5 };

const AMBIENT_PRESETS: Record<
  string,
  { ambientType: string; volume: number; falloffDistance: number }
> = {
  "ambient-forest": { ambientType: "forest", volume: 0.7, falloffDistance: 15 },
  "ambient-cave": { ambientType: "cave", volume: 0.8, falloffDistance: 10 },
  "ambient-ocean": { ambientType: "ocean", volume: 0.6, falloffDistance: 20 },
  "ambient-town": { ambientType: "town", volume: 0.5, falloffDistance: 10 },
  "ambient-desert": { ambientType: "desert", volume: 0.4, falloffDistance: 25 },
  "ambient-swamp": { ambientType: "swamp", volume: 0.7, falloffDistance: 12 },
};
const AMBIENT_DEFAULT = {
  ambientType: "custom",
  volume: 0.5,
  falloffDistance: 15,
};

const SFX_PRESETS: Record<
  string,
  { radius: number; volume: number; looping: boolean }
> = {
  "sfx-waterfall": { radius: 30, volume: 0.8, looping: true },
  "sfx-campfire": { radius: 10, volume: 0.6, looping: true },
  "sfx-bell": { radius: 50, volume: 0.9, looping: false },
};
const SFX_DEFAULT = { radius: 20, volume: 0.7, looping: false };

/** Maps entity type → context action names for add/remove. */
const ENTITY_ACTIONS: Record<string, { add: string; remove: string }> = {
  npc: { add: "addNPC", remove: "removeNPC" },
  spawnPoint: { add: "addSpawnPoint", remove: "removeSpawnPoint" },
  teleport: { add: "addTeleport", remove: "removeTeleport" },
  mobSpawn: { add: "addMobSpawn", remove: "removeMobSpawn" },
  resource: { add: "addResource", remove: "removeResource" },
  station: { add: "addStation", remove: "removeStation" },
  poi: { add: "addPOI", remove: "removePOI" },
  waterBody: { add: "addWaterBody", remove: "removeWaterBody" },
  musicZone: { add: "addMusicZone", remove: "removeMusicZone" },
  ambientZone: { add: "addAmbientZone", remove: "removeAmbientZone" },
  sfxTrigger: { add: "addSFXTrigger", remove: "removeSFXTrigger" },
  region: { add: "addRegion", remove: "removeRegion" },
  dangerSource: { add: "addDangerSource", remove: "removeDangerSource" },
  customAsset: { add: "addCustomAsset", remove: "removeCustomAsset" },
};

type Actions = ReturnType<typeof useWorldStudio>["actions"];

function resolveAction(
  actions: Actions,
  entityType: string,
  kind: "add" | "remove",
): ((...args: unknown[]) => void) | null {
  const entry = ENTITY_ACTIONS[entityType];
  if (!entry) return null;
  const name = entry[kind];
  const fn = (
    actions as unknown as Record<string, (...args: unknown[]) => void>
  )[name];
  return fn ?? null;
}

function resolveAddAction(
  actions: Actions,
  entityType: string,
): ((data: Record<string, unknown>) => void) | null {
  return resolveAction(actions, entityType, "add") as
    | ((data: Record<string, unknown>) => void)
    | null;
}

function resolveRemoveAction(
  actions: Actions,
  entityType: string,
): ((id: string) => void) | null {
  return resolveAction(actions, entityType, "remove") as
    | ((id: string) => void)
    | null;
}

export function usePlacementConfirmation() {
  const { state, actions } = useWorldStudio();
  const activePlacement = state.tools.activePlacement;
  const processedRef = useRef(false);

  useEffect(() => {
    if (!activePlacement?.confirmed || processedRef.current) return;
    processedRef.current = true;

    const { category, templateId, templateName, rotation } = activePlacement;

    // Adjust Y so the model's bottom sits on the terrain surface (same logic
    // as the transform gizmo's surface snap). Abstract markers have geometry
    // pre-translated above y=0 so getPlacementYOffset returns 0 for them.
    const yOffset = getPlacementYOffset(category, templateId);
    const position = {
      ...activePlacement.position,
      y: activePlacement.position.y + yOffset,
    };

    // Build entity data and add/remove callbacks per category
    let entityId: string | null = null;
    let addFn: ((data: Record<string, unknown>) => void) | null = null;
    let removeFn: ((id: string) => void) | null = null;
    let entityData: Record<string, unknown> = {};

    switch (category) {
      case "npcs": {
        entityId = generateId("npc");
        entityData = {
          id: entityId,
          npcTypeId: templateId,
          name: templateName,
          position: { ...position },
          rotation,
          parentContext: { type: "world" },
          properties: {},
        };
        addFn = (d) => actions.addNPC(d as never);
        removeFn = (id) => actions.removeNPC(id);
        break;
      }

      case "stations": {
        entityId = generateId("station");
        entityData = {
          id: entityId,
          stationType: templateId,
          name: templateName,
          position: { ...position },
          rotation,
          properties: {},
        };
        addFn = (d) => actions.addStation(d as never);
        removeFn = (id) => actions.removeStation(id);
        break;
      }

      case "mob-spawns": {
        entityId = generateId("mobspawn");
        entityData = {
          id: entityId,
          mobId: templateId,
          name: templateName,
          position: { ...position },
          spawnRadius: 5,
          maxCount: 3,
          respawnTicks: 100,
          properties: {},
        };
        addFn = (d) => actions.addMobSpawn(d as never);
        removeFn = (id) => actions.removeMobSpawn(id);
        break;
      }

      case "resources-mining":
      case "resources-woodcutting":
      case "resources-fishing": {
        const resourceType =
          category === "resources-mining"
            ? "mining"
            : category === "resources-woodcutting"
              ? "woodcutting"
              : "fishing";
        entityId = generateId("resource");
        entityData = {
          id: entityId,
          resourceId: templateId,
          resourceType,
          name: templateName,
          position: { ...position },
          rotation,
          modelVariant: 0,
          properties: {},
        };
        addFn = (d) => actions.addResource(d as never);
        removeFn = (id) => actions.removeResource(id);
        break;
      }

      case "spawn-points": {
        entityId = generateId("spawn");
        entityData = {
          id: entityId,
          name: templateName,
          position: { ...position },
          rotation,
          spawnType:
            templateId === "spawn-initial"
              ? "initial"
              : templateId === "spawn-death-respawn"
                ? "death-respawn"
                : "teleport-arrival",
          capacity: 1,
          properties: {},
        };
        addFn = (d) => actions.addSpawnPoint(d as never);
        removeFn = (id) => actions.removeSpawnPoint(id);
        break;
      }

      case "teleports": {
        entityId = generateId("teleport");
        const teleportType =
          activePlacement.templateId === "teleport-portal"
            ? "portal"
            : activePlacement.templateId === "teleport-shortcut"
              ? "shortcut"
              : "lodestone";
        entityData = {
          id: entityId,
          name: `${templateName}`,
          position: { ...position },
          connections: [],
          requirements: {},
          cost: 0,
          properties: { type: teleportType },
        };
        addFn = (d) => actions.addTeleport(d as never);
        removeFn = (id) => actions.removeTeleport(id);
        break;
      }

      case "pois": {
        const poiCat = activePlacement.templateId
          .replace("poi-", "")
          .replace(/-/g, "_");
        entityId = generateId("poi");
        entityData = {
          id: entityId,
          name: templateName,
          category: poiCat as
            | "dungeon"
            | "shrine"
            | "landmark"
            | "resource_area"
            | "ruin"
            | "camp"
            | "crossing"
            | "waystation"
            | "fishing_spot",
          position: { ...position },
          importance: 0.5,
          radius: 20,
          connectedRoads: [],
          properties: {},
        };
        addFn = (d) => actions.addPOI(d as never);
        removeFn = (id) => actions.removePOI(id);
        break;
      }

      case "danger-sources": {
        const preset = DANGER_PRESETS[templateId] ?? DANGER_DEFAULT;
        entityId = generateId("danger");
        entityData = {
          id: entityId,
          name: templateName,
          position: { ...position },
          radius: preset.radius,
          intensity: preset.intensity,
          falloffCurve: preset.falloffCurve,
          description: "",
        };
        addFn = (d) => actions.addDangerSource(d as never);
        removeFn = (id) => actions.removeDangerSource(id);
        break;
      }

      case "water-bodies": {
        const bodyType = activePlacement.templateId.replace("water-", "") as
          | "river"
          | "lake"
          | "pond";
        entityId = generateId("water");
        entityData = {
          id: entityId,
          name: templateName,
          bodyType,
          waypoints:
            bodyType === "river"
              ? [
                  { x: position.x - 50, z: position.z, halfWidth: 5, depth: 2 },
                  { x: position.x, z: position.z, halfWidth: 5, depth: 2 },
                  { x: position.x + 50, z: position.z, halfWidth: 5, depth: 2 },
                ]
              : undefined,
          polygon:
            bodyType === "lake"
              ? [
                  { x: position.x - 20, z: position.z - 20 },
                  { x: position.x + 20, z: position.z - 20 },
                  { x: position.x + 20, z: position.z + 20 },
                  { x: position.x - 20, z: position.z + 20 },
                ]
              : undefined,
          surfaceY: position.y,
          bermWidth: 4,
          valleyMultiplier: 2.5,
          properties: {},
        };
        addFn = (d) => actions.addWaterBody(d as never);
        removeFn = (id) => actions.removeWaterBody(id);
        break;
      }

      // Phase 9.3: Audio zone placement
      case "music-zones": {
        entityId = generateId("music");
        // Place a square polygon centered on click point
        const r = 30;
        entityData = {
          id: entityId,
          name: templateName,
          trackId: "",
          polygon: [
            { x: position.x - r, z: position.z - r },
            { x: position.x + r, z: position.z - r },
            { x: position.x + r, z: position.z + r },
            { x: position.x - r, z: position.z + r },
          ],
          priority: 0,
          blendDistance: 10,
        };
        addFn = (d) => actions.addMusicZone(d as never);
        removeFn = (id) => actions.removeMusicZone(id);
        break;
      }

      case "ambient-zones": {
        entityId = generateId("ambient");
        const ar = 25;
        const mData =
          AMBIENT_PRESETS[activePlacement.templateId] ?? AMBIENT_DEFAULT;
        entityData = {
          id: entityId,
          name: templateName,
          ambientType: mData.ambientType,
          tracks: [],
          polygon: [
            { x: position.x - ar, z: position.z - ar },
            { x: position.x + ar, z: position.z - ar },
            { x: position.x + ar, z: position.z + ar },
            { x: position.x - ar, z: position.z + ar },
          ],
          volume: mData.volume,
          falloffDistance: mData.falloffDistance,
        };
        addFn = (d) => actions.addAmbientZone(d as never);
        removeFn = (id) => actions.removeAmbientZone(id);
        break;
      }

      case "sfx-triggers": {
        entityId = generateId("sfx");
        const sfxPreset = SFX_PRESETS[templateId] ?? SFX_DEFAULT;
        entityData = {
          id: entityId,
          name: templateName,
          soundPath: "",
          position: { ...position },
          radius: sfxPreset.radius,
          volume: sfxPreset.volume,
          looping: sfxPreset.looping,
        };
        addFn = (d) => actions.addSFXTrigger(d as never);
        removeFn = (id) => actions.removeSFXTrigger(id);
        break;
      }

      // Phase 9.1: Custom asset placement
      case "custom-assets": {
        entityId = generateId("asset");
        entityData = {
          id: entityId,
          name: templateName,
          assetId: templateId,
          assetName: templateName,
          position: { ...position },
          rotation,
          scale: 1,
          properties: {},
        };
        addFn = (d) => actions.addCustomAsset(d as never);
        removeFn = (id) => actions.removeCustomAsset(id);
        break;
      }

      // Phase 9.2: Prefab placement — instantiate all entries via PlacePrefabCommand
      case "prefabs": {
        const prefab = state.prefabs.find((p) => p.id === templateId);
        if (prefab && prefab.entries.length > 0) {
          const prefabEntries: PlacePrefabEntry[] = [];

          for (const entry of prefab.entries) {
            const entryId = generateId(entry.entityType);
            const entryPos = {
              x: position.x + entry.offset.x,
              y: position.y + entry.offset.y,
              z: position.z + entry.offset.z,
            };
            const entryData: Record<string, unknown> = {
              ...structuredClone(entry.data),
              id: entryId,
              name: entry.name,
              position: entryPos,
              rotation: entry.rotation,
            };

            // Resolve add/remove callbacks from the unified action registry
            const addCb = resolveAddAction(actions, entry.entityType);
            const removeCb = resolveRemoveAction(actions, entry.entityType);
            if (addCb && removeCb) {
              prefabEntries.push({
                entityId: entryId,
                entityType: entry.entityType,
                entityData: entryData,
                onPlace: addCb,
                onRemove: removeCb,
              });
            }
          }

          if (prefabEntries.length > 0) {
            commandHistory.execute(new PlacePrefabCommand(prefabEntries));
          }
        }
        break;
      }
    }

    // Execute through command history for undo support
    if (entityId && addFn && removeFn) {
      const cmd = new PlaceEntityCommand(entityId, {
        entityType: category,
        entityData,
        onPlace: addFn,
        onRemove: removeFn,
      });
      commandHistory.execute(cmd);
    }

    // Restart placement with the same template for rapid placement
    // (UE5-style: place one, immediately ready to place another)
    actions.startPlacement(category, templateId, templateName);
  }, [activePlacement, actions, state.prefabs]);

  // Reset processed flag when placement changes
  useEffect(() => {
    if (!activePlacement?.confirmed) {
      processedRef.current = false;
    }
  }, [activePlacement?.confirmed]);
}
