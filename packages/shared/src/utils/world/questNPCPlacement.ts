/**
 * questNPCPlacement — Pure logic for placing quest NPCs contextually
 *
 * Uses placement rules from quest/NPC manifests to position quest NPCs
 * in world-appropriate locations (biome edges, near water, road sides).
 *
 * No ECS dependencies — operates on plain data + terrain callbacks.
 */

import { dist2D } from "../MathUtils";

// ============== TYPES ==============

/** Terrain query for quest NPC placement */
export interface QuestTerrainQuerier {
  getHeight(x: number, z: number): number;
  getBiome(x: number, z: number): string;
  isWater(x: number, z: number): boolean;
}

/** Placement rules (matches NPCPlacementRules in WorldStudio types) */
export interface PlacementRules {
  biomePreference?: string;
  placement?:
    | "town_interior"
    | "town_edge"
    | "biome_edge"
    | "near_water"
    | "road_side";
  maxDistFromTown?: number;
  minDistFromTown?: number;
}

/** Town reference for placement */
export interface PlacementTownRef {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  safeZoneRadius: number;
}

/** Quest NPC to place */
export interface QuestNPCToPlace {
  npcId: string;
  npcName: string;
  questIds: string[];
  rules: PlacementRules;
}

/** Placed quest NPC result */
export interface PlacedQuestNPC {
  npcId: string;
  npcName: string;
  questIds: string[];
  position: { x: number; y: number; z: number };
  rotation: number;
  nearestTownId: string;
}

// ============== SEEDED RNG ==============

function createLCG(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// ============== PLACEMENT STRATEGIES ==============

/**
 * Find a position near a town edge (just outside safe zone).
 */
function findTownEdgePosition(
  town: PlacementTownRef,
  rng: () => number,
  terrain: QuestTerrainQuerier,
  rules: PlacementRules,
): { x: number; y: number; z: number } | null {
  const minDist = rules.minDistFromTown ?? town.safeZoneRadius * 0.8;
  const maxDist = rules.maxDistFromTown ?? town.safeZoneRadius * 1.5;
  const maxAttempts = 30;

  for (let i = 0; i < maxAttempts; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = minDist + rng() * (maxDist - minDist);
    const x = town.position.x + Math.cos(angle) * dist;
    const z = town.position.z + Math.sin(angle) * dist;

    if (terrain.isWater(x, z)) continue;

    const y = terrain.getHeight(x, z);

    // Check biome preference if specified
    if (rules.biomePreference) {
      const biome = terrain.getBiome(x, z);
      if (biome !== rules.biomePreference) continue;
    }

    return { x, y, z };
  }

  return null;
}

/**
 * Find a position at a biome edge (transition between biomes).
 */
function findBiomeEdgePosition(
  town: PlacementTownRef,
  rng: () => number,
  terrain: QuestTerrainQuerier,
  rules: PlacementRules,
): { x: number; y: number; z: number } | null {
  const maxDist = rules.maxDistFromTown ?? 150;
  const minDist = rules.minDistFromTown ?? 30;
  const targetBiome = rules.biomePreference;
  const maxAttempts = 50;
  const checkDist = 15; // Distance to check for biome transition

  for (let i = 0; i < maxAttempts; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = minDist + rng() * (maxDist - minDist);
    const x = town.position.x + Math.cos(angle) * dist;
    const z = town.position.z + Math.sin(angle) * dist;

    if (terrain.isWater(x, z)) continue;

    const biome = terrain.getBiome(x, z);

    // If we have a target biome, check we're in or near it
    if (targetBiome && biome !== targetBiome) continue;

    // Check if this is actually at a biome edge
    // Sample 4 cardinal directions for biome transitions
    let atEdge = false;
    for (const [dx, dz] of [
      [checkDist, 0],
      [-checkDist, 0],
      [0, checkDist],
      [0, -checkDist],
    ]) {
      const nearbyBiome = terrain.getBiome(x + dx, z + dz);
      if (nearbyBiome !== biome) {
        atEdge = true;
        break;
      }
    }

    if (!atEdge) continue;

    return { x, y: terrain.getHeight(x, z), z };
  }

  // Fallback: just place in the target biome, edge not required
  for (let i = 0; i < 20; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = minDist + rng() * (maxDist - minDist);
    const x = town.position.x + Math.cos(angle) * dist;
    const z = town.position.z + Math.sin(angle) * dist;

    if (terrain.isWater(x, z)) continue;
    if (targetBiome && terrain.getBiome(x, z) !== targetBiome) continue;

    return { x, y: terrain.getHeight(x, z), z };
  }

  return null;
}

/**
 * Find a position near water (lake, river edge).
 */
function findNearWaterPosition(
  town: PlacementTownRef,
  rng: () => number,
  terrain: QuestTerrainQuerier,
  rules: PlacementRules,
): { x: number; y: number; z: number } | null {
  const maxDist = rules.maxDistFromTown ?? 100;
  const minDist = rules.minDistFromTown ?? 20;
  const maxAttempts = 50;
  const waterCheckDist = 10;

  for (let i = 0; i < maxAttempts; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = minDist + rng() * (maxDist - minDist);
    const x = town.position.x + Math.cos(angle) * dist;
    const z = town.position.z + Math.sin(angle) * dist;

    // Must be on land
    if (terrain.isWater(x, z)) continue;

    // Must have water nearby
    let hasNearbyWater = false;
    for (const [dx, dz] of [
      [waterCheckDist, 0],
      [-waterCheckDist, 0],
      [0, waterCheckDist],
      [0, -waterCheckDist],
    ]) {
      if (terrain.isWater(x + dx, z + dz)) {
        hasNearbyWater = true;
        break;
      }
    }
    if (!hasNearbyWater) continue;

    // Check biome if specified
    if (
      rules.biomePreference &&
      terrain.getBiome(x, z) !== rules.biomePreference
    )
      continue;

    return { x, y: terrain.getHeight(x, z), z };
  }

  return null;
}

/**
 * Place inside town (for town-based NPCs like guards, innkeepers).
 */
function findTownInteriorPosition(
  town: PlacementTownRef,
  rng: () => number,
  terrain: QuestTerrainQuerier,
): { x: number; y: number; z: number } | null {
  const maxAttempts = 20;
  const radius = town.safeZoneRadius * 0.5;

  for (let i = 0; i < maxAttempts; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * radius;
    const x = town.position.x + Math.cos(angle) * dist;
    const z = town.position.z + Math.sin(angle) * dist;

    if (terrain.isWater(x, z)) continue;

    return { x, y: terrain.getHeight(x, z), z };
  }

  return null;
}

// ============== MAIN API ==============

/**
 * Place quest NPCs using their placement rules.
 *
 * Strategy: for each NPC, find the best nearby town, then use the
 * placement strategy to position the NPC relative to that town.
 *
 * @param npcsToPlace - NPCs with placement rules
 * @param towns - Available towns
 * @param terrain - Terrain query callbacks
 * @param seed - Random seed for deterministic placement
 * @returns Array of placed quest NPCs
 */
export function placeQuestNPCs(
  npcsToPlace: QuestNPCToPlace[],
  towns: PlacementTownRef[],
  terrain: QuestTerrainQuerier,
  seed: number,
): PlacedQuestNPC[] {
  if (towns.length === 0) return [];

  const rng = createLCG(seed + 55555);
  const placed: PlacedQuestNPC[] = [];

  for (const npc of npcsToPlace) {
    const rules = npc.rules;

    // Find the best town (closest to biome preference if specified, otherwise random)
    let bestTown = towns[Math.floor(rng() * towns.length)];

    if (rules.biomePreference) {
      // Try to find a town near the preferred biome
      let bestScore = -1;
      for (const town of towns) {
        const biome = terrain.getBiome(town.position.x, town.position.z);
        const distScore =
          1 / (1 + dist2D(0, 0, town.position.x, town.position.z) * 0.001);
        const biomeMatch = biome === rules.biomePreference ? 1 : 0;
        const score = biomeMatch + distScore;
        if (score > bestScore) {
          bestScore = score;
          bestTown = town;
        }
      }
    }

    // Apply placement strategy
    let position: { x: number; y: number; z: number } | null = null;

    switch (rules.placement) {
      case "town_interior":
        position = findTownInteriorPosition(bestTown, rng, terrain);
        break;
      case "town_edge":
        position = findTownEdgePosition(bestTown, rng, terrain, rules);
        break;
      case "biome_edge":
        position = findBiomeEdgePosition(bestTown, rng, terrain, rules);
        break;
      case "near_water":
        position = findNearWaterPosition(bestTown, rng, terrain, rules);
        break;
      case "road_side":
        // Road-side placement falls back to town edge (roads not available here)
        position = findTownEdgePosition(bestTown, rng, terrain, rules);
        break;
      default:
        // Default: town edge
        position = findTownEdgePosition(bestTown, rng, terrain, rules);
        break;
    }

    // Fallback: place near town center
    if (!position) {
      position = {
        x: bestTown.position.x + (rng() - 0.5) * 20,
        y: bestTown.position.y,
        z: bestTown.position.z + (rng() - 0.5) * 20,
      };
    }

    // Face toward the nearest town
    const dx = bestTown.position.x - position.x;
    const dz = bestTown.position.z - position.z;
    const rotation = Math.atan2(dx, dz);

    placed.push({
      npcId: npc.npcId,
      npcName: npc.npcName,
      questIds: npc.questIds,
      position,
      rotation,
      nearestTownId: bestTown.id,
    });
  }

  return placed;
}

/**
 * Extract quest NPCs that need placement from quest and NPC manifests.
 *
 * Looks at quests for startNpc + placementRules, and NPCs for
 * quest service types + their own placementRules.
 */
export function extractQuestNPCsToPlace(
  quests: Array<{
    id: string;
    startNpc?: string;
    placementRules?: PlacementRules;
  }>,
  npcs: Array<{
    id: string;
    name: string;
    services?: { enabled: boolean; types: string[] };
    placementRules?: PlacementRules;
  }>,
): QuestNPCToPlace[] {
  const npcMap = new Map(npcs.map((n) => [n.id, n]));
  const questsByNpc = new Map<string, string[]>();

  // Group quests by their start NPC
  for (const quest of quests) {
    if (!quest.startNpc) continue;
    const existing = questsByNpc.get(quest.startNpc) ?? [];
    existing.push(quest.id);
    questsByNpc.set(quest.startNpc, existing);
  }

  const toPlace: QuestNPCToPlace[] = [];

  for (const [npcId, questIds] of questsByNpc) {
    const npc = npcMap.get(npcId);
    if (!npc) continue;

    // Skip NPCs that are stationary shop types (they go inside buildings)
    const isShopOnly =
      npc.services?.types.length === 1 && npc.services.types[0] === "shop";
    if (isShopOnly) continue;

    // Get placement rules: NPC-level rules take precedence over quest-level
    let rules: PlacementRules = {};
    if (npc.placementRules) {
      rules = npc.placementRules;
    } else {
      // Check if any quest has placement rules for this NPC
      for (const questId of questIds) {
        const quest = quests.find((q) => q.id === questId);
        if (quest?.placementRules) {
          rules = quest.placementRules;
          break;
        }
      }
    }

    // Default placement: town edge
    if (!rules.placement) {
      rules = { ...rules, placement: "town_edge" };
    }

    toPlace.push({
      npcId,
      npcName: npc.name,
      questIds,
      rules,
    });
  }

  return toPlace;
}
