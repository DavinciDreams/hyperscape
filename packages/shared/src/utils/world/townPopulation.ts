/**
 * townPopulation — Pure logic for town NPC placement
 *
 * Extracted from TownSystem.extractNPCSpawnPosition() so the editor
 * can compute NPC positions without instantiating a full ECS World.
 *
 * Dependencies: only procgen building utilities (getCellCenter, getSideVector, etc.)
 */

import {
  type BuildingLayout,
  type PropPlacements,
  CELL_SIZE,
  ENTRANCE_STEP_HEIGHT,
  NPC_BEHIND_COUNTER_OFFSET,
  getCellCenter,
  getSideVector,
} from "@hyperscape/procgen/building";

// ============== TYPES ==============

/** NPC spawn position calculated from building interior placement */
export interface BuildingNPCSpawn {
  /** World position for the NPC */
  position: { x: number; y: number; z: number };
  /** NPC facing direction (radians) */
  rotation: number;
  /** NPC type to spawn (e.g., "innkeeper", "banker", "blacksmith") */
  npcType: string;
  /** Building ID this NPC belongs to */
  buildingId: string;
}

/** Minimal building info needed for NPC extraction */
export interface BuildingInfo {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  rotation: number;
}

// ============== BUILDING → NPC MAPPING ==============

/** Mapping from building type to NPC type */
export const BUILDING_NPC_TYPES: Record<string, string> = {
  inn: "innkeeper",
  bank: "banker",
  smithy: "blacksmith",
  store: "shopkeeper",
  church: "priest",
  cathedral: "priest",
  chapel: "priest",
  "guild-hall": "guild-master",
  "town-hall": "mayor",
  mansion: "noble",
  manor: "noble",
  keep: "guard-captain",
  fortress: "guard-captain",
  castle: "lord",
};

// ============== EXTRACTION ==============

/**
 * Extract NPC spawn position from a single building's prop placements.
 * Converts building-local coordinates to world coordinates.
 *
 * Returns null if the building type has no NPC mapping or no valid placement.
 */
export function extractBuildingNPC(
  building: BuildingInfo,
  layout: BuildingLayout,
  propPlacements?: PropPlacements,
): BuildingNPCSpawn | null {
  if (!propPlacements) return null;

  const npcType = BUILDING_NPC_TYPES[building.type];
  if (!npcType) return null;

  let localX: number;
  let localZ: number;
  let npcRotation: number;

  if (building.type === "smithy" && propPlacements.forge) {
    // Blacksmith stands near the forge
    const forgePlacement = propPlacements.forge;
    const cellCenter = getCellCenter(
      forgePlacement.col,
      forgePlacement.row,
      CELL_SIZE,
      layout.width,
      layout.depth,
    );
    // Stand next to the forge (offset by 1 meter)
    localX = cellCenter.x + 1.0;
    localZ = cellCenter.z;
    // Face toward the forge (toward the entrance usually)
    npcRotation = building.rotation + Math.PI;
  } else {
    // Inn bar or bank counter — NPC stands behind counter
    let placement:
      | {
          col: number;
          row: number;
          side: string;
          secondCell?: { col: number; row: number };
        }
      | null
      | undefined;

    if (building.type === "inn") {
      placement = propPlacements.innBar;
    } else if (building.type === "bank") {
      placement = propPlacements.bankCounter;
    }

    if (!placement) return null;

    // Calculate cell center in building-local coordinates
    if (placement.secondCell) {
      // 2-tile counter: use center between the two cells
      const cell1 = getCellCenter(
        placement.col,
        placement.row,
        CELL_SIZE,
        layout.width,
        layout.depth,
      );
      const cell2 = getCellCenter(
        placement.secondCell.col,
        placement.secondCell.row,
        CELL_SIZE,
        layout.width,
        layout.depth,
      );
      localX = (cell1.x + cell2.x) / 2;
      localZ = (cell1.z + cell2.z) / 2;
    } else {
      // Single-tile counter
      const cellCenter = getCellCenter(
        placement.col,
        placement.row,
        CELL_SIZE,
        layout.width,
        layout.depth,
      );
      localX = cellCenter.x;
      localZ = cellCenter.z;
    }

    // NPC offset: between counter's back face and the wall's interior face
    const sideVec = getSideVector(placement.side);
    localX += sideVec.x * NPC_BEHIND_COUNTER_OFFSET;
    localZ += sideVec.z * NPC_BEHIND_COUNTER_OFFSET;

    // NPC faces away from the wall (toward customers)
    let faceAngle = 0;
    switch (placement.side) {
      case "north":
        faceAngle = Math.PI;
        break;
      case "south":
        faceAngle = 0;
        break;
      case "east":
        faceAngle = -Math.PI / 2;
        break;
      case "west":
        faceAngle = Math.PI / 2;
        break;
    }
    npcRotation = faceAngle + building.rotation;
  }

  // Transform to world coordinates
  const cos = Math.cos(building.rotation);
  const sin = Math.sin(building.rotation);
  const worldX = building.position.x + localX * cos - localZ * sin;
  const worldZ = building.position.z + localX * sin + localZ * cos;

  // Y: building floor height = foundation steps above building position
  const dynamicFoundationH = layout.foundationSteps * ENTRANCE_STEP_HEIGHT;
  const worldY = building.position.y + dynamicFoundationH;

  return {
    position: { x: worldX, y: worldY, z: worldZ },
    rotation: npcRotation,
    npcType,
    buildingId: building.id,
  };
}

/**
 * Extract NPC spawns for all buildings in a town.
 * Returns an array of NPC spawn positions (one per building that has an NPC mapping).
 */
export function extractTownNPCs(
  buildings: BuildingInfo[],
  layouts: Map<string, BuildingLayout>,
  propPlacementsMap: Map<string, PropPlacements>,
): BuildingNPCSpawn[] {
  const spawns: BuildingNPCSpawn[] = [];

  for (const building of buildings) {
    const layout = layouts.get(building.id);
    if (!layout) continue;

    const propPlacements = propPlacementsMap.get(building.id);
    const spawn = extractBuildingNPC(building, layout, propPlacements);
    if (spawn) {
      spawns.push(spawn);
    }
  }

  return spawns;
}
