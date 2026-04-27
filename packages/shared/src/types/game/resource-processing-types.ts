/**
 * Resource and Processing Types
 * All resource gathering, skilling, fires, and processing action type definitions
 */

import * as THREE from "../../extras/three/three";
import type { Position3D } from "../core/base-types";

// ============== RESOURCE TYPES ==============

/**
 * Resource footprint - predefined sizes for how many tiles a resource occupies
 * Used for tile-based-MMORPG-accurate tile-based positioning and interaction
 *
 * - standard: 1×1 tile (normal trees, rocks, fishing spots)
 * - large: 2×2 tiles (ancient trees, large ore veins)
 * - massive: 3×3 tiles (world trees, raid objects)
 *
 * Multi-tile resources use the SW (south-west) tile as their anchor,
 * matching classic MMORPG behavior for large objects.
 *
 * @see
 */
export type ResourceFootprint = "standard" | "large" | "massive";

/**
 * Direct footprint dimensions for arbitrary shapes
 * Use when predefined sizes don't fit (e.g., 2×1 counter, 1×3 wall)
 */
export interface FootprintDimensions {
  /** Width in tiles (X axis) */
  width: number;
  /** Depth in tiles (Z axis) */
  depth: number;
}

/**
 * Flexible footprint specification - accepts either:
 * - Predefined string: "standard", "large", "massive"
 * - Direct dimensions: { width: 2, depth: 1 }
 */
export type FootprintSpec = ResourceFootprint | FootprintDimensions;

/**
 * Tile dimensions for each predefined footprint type
 * Used to calculate occupied tiles and interaction positions
 */
export const FOOTPRINT_SIZES: Record<
  ResourceFootprint,
  { x: number; z: number }
> = {
  standard: { x: 1, z: 1 },
  large: { x: 2, z: 2 },
  massive: { x: 3, z: 3 },
};

/**
 * Resolve any footprint spec to dimensions { x, z }
 * Handles both predefined strings and direct dimensions
 *
 * @param footprint - Predefined string or direct dimensions
 * @returns Dimensions in { x, z } format
 */
export function resolveFootprint(footprint: FootprintSpec): {
  x: number;
  z: number;
} {
  if (typeof footprint === "string") {
    return FOOTPRINT_SIZES[footprint] || FOOTPRINT_SIZES.standard;
  }
  return { x: footprint.width, z: footprint.depth };
}

// Game-specific types (Resource, ResourceDrop, Fire, ProcessingAction,
// DeathData) migrated to `@hyperforge/hyperscape-plugin/types/
// resource-game-types` 2026-04-27 (top-10 #8, slice 30). The
// footprint primitives above stay here because they're consumed by
// engine substrate (entities.ts, TerrainSystem, RaycastService,
// StationDataProvider).
