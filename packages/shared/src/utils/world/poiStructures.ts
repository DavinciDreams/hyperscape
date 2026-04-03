/**
 * poiStructures — Template-driven POI structure generation
 *
 * Defines structure templates for POI categories (ruins, camps, shrines,
 * resource clearings, fishing piers) and generates placement data for
 * the objects that compose each structure.
 *
 * No ECS dependencies — operates on plain data.
 */

import type { POICategory } from "../../types/world/world-types";
import { dist2D } from "../MathUtils";

// ============== TYPES ==============

/** A single object within a POI structure */
export interface StructureObject {
  /** Template object type (e.g., "tent", "campfire", "altar") */
  type: string;
  /** Offset from POI center */
  offset: { x: number; y: number; z: number };
  /** Y-axis rotation in radians */
  rotation: number;
  /** Optional scale multiplier (default 1) */
  scale?: number;
  /** Optional metadata (e.g., "damaged: true" for ruins) */
  metadata?: Record<string, unknown>;
}

/** Structure template definition */
export interface POIStructureTemplate {
  /** Template ID */
  id: string;
  /** Display name */
  name: string;
  /** Which POI categories this template applies to */
  categories: POICategory[];
  /** Base objects always placed */
  objects: StructureObject[];
  /** Optional object groups — one is randomly selected per group */
  optionalGroups?: {
    /** Group name (for debugging) */
    name: string;
    /** Weight for including this group (0-1, default 1 = always) */
    weight: number;
    objects: StructureObject[];
  }[];
  /** Vegetation suppression radius (meters) — vegetation density → 0 inside this */
  vegetationClearRadius: number;
  /** Whether this template produces a "damaged" variant (for ruins) */
  damaged?: boolean;
}

/** Placed POI structure — result of generation */
export interface PlacedPOIStructure {
  poiId: string;
  templateId: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  objects: PlacedStructureObject[];
  vegetationClearRadius: number;
}

/** A placed object within a structure */
export interface PlacedStructureObject {
  type: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  scale: number;
  metadata?: Record<string, unknown>;
}

/** POI reference for structure generation */
export interface StructurePOIRef {
  id: string;
  category: POICategory;
  position: { x: number; y: number; z: number };
  radius: number;
}

/** Terrain query for structure placement */
export interface StructureTerrainQuerier {
  getHeight(x: number, z: number): number;
}

// ============== TEMPLATES ==============

const CAMP_TEMPLATE: POIStructureTemplate = {
  id: "camp_basic",
  name: "Basic Camp",
  categories: ["camp"],
  vegetationClearRadius: 15,
  objects: [
    { type: "campfire", offset: { x: 0, y: 0, z: 0 }, rotation: 0 },
    { type: "tent", offset: { x: -4, y: 0, z: -2 }, rotation: 0.3 },
    { type: "crate", offset: { x: 3, y: 0, z: -1 }, rotation: 0.8, scale: 0.9 },
    {
      type: "crate",
      offset: { x: 3.5, y: 0, z: 0.5 },
      rotation: 1.2,
      scale: 0.7,
    },
    { type: "barrel", offset: { x: -3, y: 0, z: 2 }, rotation: 0 },
  ],
  optionalGroups: [
    {
      name: "bedroll",
      weight: 0.7,
      objects: [
        { type: "bedroll", offset: { x: 2, y: 0, z: -3 }, rotation: -0.5 },
      ],
    },
    {
      name: "cooking",
      weight: 0.5,
      objects: [
        { type: "cooking_spit", offset: { x: 0.5, y: 0, z: 1.5 }, rotation: 0 },
      ],
    },
  ],
};

const SHRINE_TEMPLATE: POIStructureTemplate = {
  id: "shrine_basic",
  name: "Shrine",
  categories: ["shrine"],
  vegetationClearRadius: 8,
  objects: [
    { type: "altar", offset: { x: 0, y: 0, z: 0 }, rotation: 0 },
    {
      type: "pillar",
      offset: { x: -2.5, y: 0, z: -2.5 },
      rotation: 0,
      scale: 0.8,
    },
    {
      type: "pillar",
      offset: { x: 2.5, y: 0, z: -2.5 },
      rotation: 0,
      scale: 0.8,
    },
    {
      type: "pillar",
      offset: { x: -2.5, y: 0, z: 2.5 },
      rotation: 0,
      scale: 0.8,
    },
    {
      type: "pillar",
      offset: { x: 2.5, y: 0, z: 2.5 },
      rotation: 0,
      scale: 0.8,
    },
  ],
  optionalGroups: [
    {
      name: "offerings",
      weight: 0.6,
      objects: [
        {
          type: "candle",
          offset: { x: -1, y: 0.8, z: 0 },
          rotation: 0,
          scale: 0.5,
        },
        {
          type: "candle",
          offset: { x: 1, y: 0.8, z: 0 },
          rotation: 0,
          scale: 0.5,
        },
      ],
    },
  ],
};

const RUIN_TEMPLATE: POIStructureTemplate = {
  id: "ruin_basic",
  name: "Ruined Structure",
  categories: ["ruin"],
  vegetationClearRadius: 25,
  damaged: true,
  objects: [
    {
      type: "wall_damaged",
      offset: { x: -5, y: 0, z: 0 },
      rotation: 0,
      metadata: { damage: 0.7 },
    },
    {
      type: "wall_damaged",
      offset: { x: 5, y: 0, z: 0 },
      rotation: Math.PI,
      metadata: { damage: 0.5 },
    },
    {
      type: "wall_damaged",
      offset: { x: 0, y: 0, z: -5 },
      rotation: Math.PI / 2,
      metadata: { damage: 0.9 },
    },
    {
      type: "rubble",
      offset: { x: -2, y: 0, z: 3 },
      rotation: 0.4,
      scale: 1.2,
    },
    {
      type: "rubble",
      offset: { x: 3, y: 0, z: -2 },
      rotation: 1.8,
      scale: 0.8,
    },
    {
      type: "crate",
      offset: { x: 0, y: 0, z: 0 },
      rotation: 0.5,
      metadata: { damaged: true },
    },
  ],
  optionalGroups: [
    {
      name: "treasure",
      weight: 0.3,
      objects: [
        {
          type: "chest",
          offset: { x: -1, y: 0, z: -3 },
          rotation: 0.2,
          metadata: { locked: true },
        },
      ],
    },
  ],
};

const RESOURCE_CLEARING_TEMPLATE: POIStructureTemplate = {
  id: "resource_clearing",
  name: "Resource Clearing",
  categories: ["resource_area"],
  vegetationClearRadius: 20,
  objects: [
    { type: "stump", offset: { x: -3, y: 0, z: 2 }, rotation: 0, scale: 1.2 },
    { type: "stump", offset: { x: 4, y: 0, z: -1 }, rotation: 1.5 },
    {
      type: "fallen_log",
      offset: { x: 0, y: 0, z: 5 },
      rotation: 0.8,
      scale: 1.1,
    },
    {
      type: "boulder",
      offset: { x: -5, y: 0, z: -3 },
      rotation: 0,
      scale: 0.9,
    },
  ],
};

const FISHING_PIER_TEMPLATE: POIStructureTemplate = {
  id: "fishing_pier",
  name: "Fishing Pier",
  categories: ["fishing_spot"],
  vegetationClearRadius: 10,
  objects: [
    { type: "dock_pier", offset: { x: 0, y: 0, z: 0 }, rotation: 0 },
    {
      type: "barrel",
      offset: { x: -1.5, y: 0, z: -2 },
      rotation: 0.3,
      scale: 0.8,
    },
    {
      type: "crate",
      offset: { x: 1.5, y: 0, z: -2 },
      rotation: -0.2,
      scale: 0.7,
    },
  ],
};

const WAYSTATION_TEMPLATE: POIStructureTemplate = {
  id: "waystation",
  name: "Waystation",
  categories: ["waystation"],
  vegetationClearRadius: 10,
  objects: [
    { type: "signpost", offset: { x: 0, y: 0, z: 0 }, rotation: 0 },
    { type: "bench", offset: { x: -2, y: 0, z: 1 }, rotation: 0.2 },
    { type: "lamppost", offset: { x: 2, y: 0, z: 0 }, rotation: 0 },
  ],
  optionalGroups: [
    {
      name: "water_barrel",
      weight: 0.5,
      objects: [
        { type: "barrel", offset: { x: -2, y: 0, z: -1.5 }, rotation: 0 },
      ],
    },
  ],
};

const DUNGEON_ENTRANCE_TEMPLATE: POIStructureTemplate = {
  id: "dungeon_entrance",
  name: "Dungeon Entrance",
  categories: ["dungeon"],
  vegetationClearRadius: 20,
  objects: [
    { type: "cave_entrance", offset: { x: 0, y: 0, z: 0 }, rotation: 0 },
    {
      type: "pillar",
      offset: { x: -3, y: 0, z: -1 },
      rotation: 0,
      metadata: { damaged: true },
    },
    {
      type: "pillar",
      offset: { x: 3, y: 0, z: -1 },
      rotation: 0,
      metadata: { damaged: true },
    },
    {
      type: "rubble",
      offset: { x: -2, y: 0, z: 2 },
      rotation: 0.7,
      scale: 0.6,
    },
    {
      type: "rubble",
      offset: { x: 2.5, y: 0, z: 3 },
      rotation: 1.3,
      scale: 0.8,
    },
  ],
};

const LANDMARK_TEMPLATE: POIStructureTemplate = {
  id: "landmark_basic",
  name: "Landmark",
  categories: ["landmark"],
  vegetationClearRadius: 12,
  objects: [
    { type: "monument", offset: { x: 0, y: 0, z: 0 }, rotation: 0, scale: 1.5 },
    {
      type: "boulder",
      offset: { x: -4, y: 0, z: 2 },
      rotation: 0.5,
      scale: 1.3,
    },
    {
      type: "boulder",
      offset: { x: 3, y: 0, z: -3 },
      rotation: 1.1,
      scale: 0.7,
    },
  ],
};

const CROSSING_TEMPLATE: POIStructureTemplate = {
  id: "crossing",
  name: "River Crossing",
  categories: ["crossing"],
  vegetationClearRadius: 10,
  objects: [
    { type: "signpost", offset: { x: -3, y: 0, z: 0 }, rotation: 0 },
    { type: "fence_post", offset: { x: -2, y: 0, z: 3 }, rotation: 0 },
    { type: "fence_post", offset: { x: -2, y: 0, z: -3 }, rotation: 0 },
  ],
};

/** All built-in templates */
export const DEFAULT_TEMPLATES: POIStructureTemplate[] = [
  CAMP_TEMPLATE,
  SHRINE_TEMPLATE,
  RUIN_TEMPLATE,
  RESOURCE_CLEARING_TEMPLATE,
  FISHING_PIER_TEMPLATE,
  WAYSTATION_TEMPLATE,
  DUNGEON_ENTRANCE_TEMPLATE,
  LANDMARK_TEMPLATE,
  CROSSING_TEMPLATE,
];

// ============== SEEDED RNG ==============

function createLCG(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// ============== GENERATION ==============

/**
 * Find the best template for a POI category.
 * If custom templates are provided, they take precedence.
 */
function findTemplate(
  category: POICategory,
  customTemplates?: POIStructureTemplate[],
): POIStructureTemplate | null {
  // Check custom templates first
  if (customTemplates) {
    const custom = customTemplates.find((t) => t.categories.includes(category));
    if (custom) return custom;
  }
  return DEFAULT_TEMPLATES.find((t) => t.categories.includes(category)) ?? null;
}

/**
 * Transform a template's local objects to world-space for a given POI position and rotation.
 */
function instantiateTemplate(
  template: POIStructureTemplate,
  position: { x: number; y: number; z: number },
  rotation: number,
  terrain: StructureTerrainQuerier,
  rng: () => number,
): PlacedStructureObject[] {
  const result: PlacedStructureObject[] = [];
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  function transformObject(obj: StructureObject): PlacedStructureObject {
    // Rotate offset around Y axis
    const wx = position.x + obj.offset.x * cos - obj.offset.z * sin;
    const wz = position.z + obj.offset.x * sin + obj.offset.z * cos;
    const wy = terrain.getHeight(wx, wz) + obj.offset.y;

    return {
      type: obj.type,
      position: { x: wx, y: wy, z: wz },
      rotation: obj.rotation + rotation,
      scale: obj.scale ?? 1,
      metadata: obj.metadata,
    };
  }

  // Place base objects
  for (const obj of template.objects) {
    result.push(transformObject(obj));
  }

  // Evaluate optional groups
  if (template.optionalGroups) {
    for (const group of template.optionalGroups) {
      if (rng() < group.weight) {
        for (const obj of group.objects) {
          result.push(transformObject(obj));
        }
      }
    }
  }

  return result;
}

/**
 * Generate structures for a set of POIs.
 *
 * @param pois - POIs that need structures
 * @param terrain - Terrain height query
 * @param seed - Random seed for deterministic generation
 * @param customTemplates - Optional custom templates (override defaults)
 * @returns Array of placed structures
 */
export function generatePOIStructures(
  pois: StructurePOIRef[],
  terrain: StructureTerrainQuerier,
  seed: number,
  customTemplates?: POIStructureTemplate[],
): PlacedPOIStructure[] {
  const rng = createLCG(seed + 77777);
  const placed: PlacedPOIStructure[] = [];

  for (const poi of pois) {
    const template = findTemplate(poi.category, customTemplates);
    if (!template) continue;

    const rotation = rng() * Math.PI * 2;
    const objects = instantiateTemplate(
      template,
      poi.position,
      rotation,
      terrain,
      rng,
    );

    placed.push({
      poiId: poi.id,
      templateId: template.id,
      position: poi.position,
      rotation,
      objects,
      vegetationClearRadius: template.vegetationClearRadius,
    });
  }

  return placed;
}
