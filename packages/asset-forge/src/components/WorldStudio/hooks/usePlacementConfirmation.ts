/**
 * usePlacementConfirmation — Creates entities when placement is confirmed
 *
 * Watches for the `confirmed` flag on activePlacement and dispatches
 * the appropriate ADD_* action to create the entity in extended layers.
 * After creation, clears the placement (or starts a new one for rapid placement).
 */

import { useEffect, useRef } from "react";

import { commandHistory, PlaceEntityCommand } from "../../../editor/commands";
import { useWorldStudio } from "../WorldStudioContext";
import { getPlacementYOffset } from "./useEditorWorldSync";

let nextEntityId = 1;
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${nextEntityId++}`;
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
        entityData = {
          id: entityId,
          name: `Teleport ${templateName}`,
          position: { ...position },
          connections: [],
          requirements: {},
          cost: 0,
          properties: {},
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
  }, [activePlacement, actions]);

  // Reset processed flag when placement changes
  useEffect(() => {
    if (!activePlacement?.confirmed) {
      processedRef.current = false;
    }
  }, [activePlacement?.confirmed]);
}
