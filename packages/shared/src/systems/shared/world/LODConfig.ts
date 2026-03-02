/**
 * LODConfig.ts - Unified LOD Distance Configuration
 *
 * Single source of truth for all Level-of-Detail distances across the engine.
 * Pure data + utility math — no shader code, no Three.js material dependencies.
 *
 * Used by: VegetationSystem, ResourceEntity, BuildingRenderingSystem, etc.
 *
 * @module LODConfig
 */

import * as THREE from "../../../extras/three/three";

// ============================================================================
// TYPES
// ============================================================================

/**
 * LOD distances for a category.
 * All distances in meters from camera.
 *
 * LOD Pipeline:
 * - LOD0 (0 to lod1Distance): Full detail mesh
 * - LOD1 (lod1Distance to lod2Distance): Low-poly mesh (~10% verts)
 * - LOD2 (lod2Distance to imposterDistance): Very low-poly mesh (~3% verts)
 * - Impostor (imposterDistance to fadeDistance): Billboard
 * - Culled (> fadeDistance): Hidden
 */
export interface LODDistances {
  /** Distance to switch from LOD0 (full detail) to LOD1 (low poly ~10%) */
  lod1Distance: number;
  /** Distance to switch from LOD1 to LOD2 (very low poly ~3%) */
  lod2Distance: number;
  /** Distance to switch from 3D mesh to billboard imposter */
  imposterDistance: number;
  /** Distance at which to completely fade out/cull */
  fadeDistance: number;
}

/**
 * LOD distances with pre-computed squared values for performance.
 * Use squared distances to avoid Math.sqrt in hot paths.
 */
export interface LODDistancesWithSq extends LODDistances {
  lod1DistanceSq: number;
  lod2DistanceSq: number;
  imposterDistanceSq: number;
  fadeDistanceSq: number;
}

// ============================================================================
// DISTANCE TABLE
// ============================================================================

/**
 * UNIFIED LOD CONFIGURATION - Single source of truth for all LOD distances.
 *
 * This is the canonical configuration used by:
 * - VegetationSystem (trees, bushes, grass, etc.)
 * - ResourceEntity (harvestable resources)
 * - Any other LOD systems
 *
 * Categories can be customized based on object size and visual importance.
 */
export const LOD_DISTANCES: Record<string, LODDistances> = {
  // Large vegetation - aggressive LOD for performance
  tree: {
    lod1Distance: 30,
    lod2Distance: 60,
    imposterDistance: 100,
    fadeDistance: 180,
  },

  // Medium vegetation
  bush: {
    lod1Distance: 40,
    lod2Distance: 80,
    imposterDistance: 120,
    fadeDistance: 200,
  },
  fern: {
    lod1Distance: 30,
    lod2Distance: 55,
    imposterDistance: 80,
    fadeDistance: 120,
  },
  rock: {
    lod1Distance: 50,
    lod2Distance: 100,
    imposterDistance: 150,
    fadeDistance: 250,
  },
  fallen_tree: {
    lod1Distance: 45,
    lod2Distance: 90,
    imposterDistance: 130,
    fadeDistance: 200,
  },

  // Small vegetation (aggressive culling - skip LOD2, go straight to impostor)
  flower: {
    lod1Distance: 25,
    lod2Distance: 45, // Same as imposter - skip LOD2
    imposterDistance: 60,
    fadeDistance: 100,
  },
  mushroom: {
    lod1Distance: 15,
    lod2Distance: 30, // Same as imposter - skip LOD2
    imposterDistance: 40,
    fadeDistance: 80,
  },
  grass: {
    lod1Distance: 10,
    lod2Distance: 20, // Same as imposter - skip LOD2
    imposterDistance: 30,
    fadeDistance: 60,
  },

  // Resources (harvestable objects)
  resource: {
    lod1Distance: 45,
    lod2Distance: 85,
    imposterDistance: 120,
    fadeDistance: 200,
  },
  tree_resource: {
    lod1Distance: 25, // Switch to LOD1 very early
    lod2Distance: 50,
    imposterDistance: 80, // Switch to impostor ASAP
    fadeDistance: 150, // Fade out earlier
  },
  rock_resource: {
    lod1Distance: 50,
    lod2Distance: 100,
    imposterDistance: 150,
    fadeDistance: 250,
  },

  // Buildings - simple geometry, skip intermediate LODs and go directly to impostor
  // LOD0 (0-80m): Full detail batched mesh with shadows
  // Impostor (80-200m): Octahedral billboard
  // Culled (>200m): Hidden
  building: {
    lod1Distance: 80, // Same as impostor - skip intermediate LOD
    lod2Distance: 80, // Same as impostor - skip intermediate LOD
    imposterDistance: 80, // Switch to impostor at 80m
    fadeDistance: 200, // Cull at 200m
  },
  station: {
    lod1Distance: 60,
    lod2Distance: 140,
    imposterDistance: 200,
    fadeDistance: 350,
  },

  // Mobs and NPCs (skip LOD2 - use LOD1 to impostor)
  mob: {
    lod1Distance: 40,
    lod2Distance: 70,
    imposterDistance: 100,
    fadeDistance: 150,
  },
  npc: {
    lod1Distance: 50,
    lod2Distance: 90,
    imposterDistance: 120,
    fadeDistance: 180,
  },
  player: {
    lod1Distance: 50,
    lod2Distance: 90,
    imposterDistance: 120,
    fadeDistance: 200,
  },

  // Items (skip LOD2)
  item: {
    lod1Distance: 25,
    lod2Distance: 45,
    imposterDistance: 60,
    fadeDistance: 100,
  },
};

/** Default LOD distances for unknown categories */
export const DEFAULT_LOD_DISTANCES: LODDistances = {
  lod1Distance: 45,
  lod2Distance: 85,
  imposterDistance: 120,
  fadeDistance: 200,
};

// ============================================================================
// SIZE-BASED SCALING
// ============================================================================

/**
 * Reference size (in meters) for LOD distance scaling.
 * Objects larger than this get proportionally extended draw distances.
 * Objects smaller than this get proportionally reduced draw distances.
 *
 * Based on typical "medium" object size (a small tree or large bush).
 */
export const LOD_REFERENCE_SIZE = 5.0;

/**
 * Minimum scale factor (prevents tiny objects from having 0 draw distance)
 */
export const LOD_MIN_SCALE = 0.3;

/**
 * Maximum scale factor (prevents huge objects from having infinite draw distance)
 */
export const LOD_MAX_SCALE = 10.0;

/**
 * Calculate size-based LOD distance scale factor.
 *
 * Formula: scale = clamp(boundingSize / referenceSize, minScale, maxScale)
 *
 * Examples:
 * - 5m object (reference): scale = 1.0x (normal distances)
 * - 10m object: scale = 2.0x (double distances)
 * - 50m object: scale = 10.0x (max, capped)
 * - 2m object: scale = 0.4x (40% of normal)
 * - 0.5m object: scale = 0.3x (min, capped)
 *
 * @param boundingSize - Bounding box diagonal or sphere diameter in meters
 * @returns Scale factor to multiply with base LOD distances
 */
export function calculateLODScaleFactor(boundingSize: number): number {
  if (boundingSize <= 0) return 1.0;
  const rawScale = boundingSize / LOD_REFERENCE_SIZE;
  return Math.max(LOD_MIN_SCALE, Math.min(LOD_MAX_SCALE, rawScale));
}

// ============================================================================
// CACHED LOOKUPS
// ============================================================================

/** Cache for LOD configs with pre-computed squared distances */
const lodDistanceCache = new Map<string, LODDistancesWithSq>();

/** Cache for size-scaled LOD configs */
const lodDistanceSizeCache = new Map<string, LODDistancesWithSq>();

/**
 * Get LOD distances for a category with pre-computed squared values.
 * Caches results for performance.
 *
 * @param category - Category name (e.g., "tree", "bush", "resource")
 * @returns LOD distances with squared values for distance comparisons
 */
export function getLODDistances(category: string): LODDistancesWithSq {
  const cached = lodDistanceCache.get(category);
  if (cached) return cached;

  const base = LOD_DISTANCES[category] ?? DEFAULT_LOD_DISTANCES;

  const withSq: LODDistancesWithSq = {
    ...base,
    lod1DistanceSq: base.lod1Distance * base.lod1Distance,
    lod2DistanceSq: base.lod2Distance * base.lod2Distance,
    imposterDistanceSq: base.imposterDistance * base.imposterDistance,
    fadeDistanceSq: base.fadeDistance * base.fadeDistance,
  };

  lodDistanceCache.set(category, withSq);
  return withSq;
}

/**
 * Get LOD distances scaled by object size.
 *
 * Larger objects (bigger bounding box) get proportionally extended draw distances,
 * allowing them to be visible from farther away as imposters.
 *
 * @param category - Category name (e.g., "tree", "bush", "resource")
 * @param boundingSize - Bounding box diagonal or sphere diameter in meters
 * @returns LOD distances scaled by object size with pre-computed squared values
 */
export function getLODDistancesScaled(
  category: string,
  boundingSize: number,
): LODDistancesWithSq {
  const roundedSize = Math.round(boundingSize * 10) / 10;
  const cacheKey = `${category}_${roundedSize}`;

  const cached = lodDistanceSizeCache.get(cacheKey);
  if (cached) return cached;

  const base = LOD_DISTANCES[category] ?? DEFAULT_LOD_DISTANCES;
  const scale = calculateLODScaleFactor(boundingSize);

  const scaled: LODDistancesWithSq = {
    lod1Distance: base.lod1Distance * scale,
    lod2Distance: base.lod2Distance * scale,
    imposterDistance: base.imposterDistance * scale,
    fadeDistance: base.fadeDistance * scale,
    lod1DistanceSq: (base.lod1Distance * scale) ** 2,
    lod2DistanceSq: (base.lod2Distance * scale) ** 2,
    imposterDistanceSq: (base.imposterDistance * scale) ** 2,
    fadeDistanceSq: (base.fadeDistance * scale) ** 2,
  };

  lodDistanceSizeCache.set(cacheKey, scaled);
  return scaled;
}

/**
 * Get LOD configuration for an entity or object, with size-based scaling.
 *
 * Convenience function that extracts bounding size from common object types.
 *
 * @param category - Category name
 * @param object - THREE.Object3D, bounding box, or bounding sphere
 * @returns Scaled LOD distances
 */
export function getLODConfig(
  category: string,
  object?:
    | THREE.Object3D
    | THREE.Box3
    | THREE.Sphere
    | { boundingSize: number }
    | number,
): LODDistancesWithSq {
  if (object === undefined || object === null) {
    return getLODDistances(category);
  }

  let boundingSize: number;

  if (typeof object === "number") {
    boundingSize = object;
  } else if ("boundingSize" in object) {
    boundingSize = object.boundingSize;
  } else if (object instanceof THREE.Box3) {
    const size = new THREE.Vector3();
    object.getSize(size);
    boundingSize = size.length();
  } else if (object instanceof THREE.Sphere) {
    boundingSize = object.radius * 2;
  } else if (object instanceof THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    boundingSize = size.length();
  } else {
    return getLODDistances(category);
  }

  return getLODDistancesScaled(category, boundingSize);
}

/**
 * Clear the LOD distance cache.
 * Call this if LOD_DISTANCES is modified at runtime.
 */
export function clearLODDistanceCache(): void {
  lodDistanceCache.clear();
  lodDistanceSizeCache.clear();
}

/**
 * Apply LOD settings from a manifest or external configuration.
 * Merges with existing configuration and clears the cache.
 *
 * @param settings - LOD settings with distanceThresholds
 */
export function applyLODSettings(settings: {
  distanceThresholds?: Record<
    string,
    { lod1?: number; lod2?: number; imposter: number; fadeOut: number }
  >;
}): void {
  if (!settings.distanceThresholds) return;

  for (const [category, thresholds] of Object.entries(
    settings.distanceThresholds,
  )) {
    const configKey = category === "fallen" ? "fallen_tree" : category;

    const lod1 = thresholds.lod1 ?? 0;
    const lod2 = thresholds.lod2 ?? (lod1 + thresholds.imposter) / 2;

    LOD_DISTANCES[configKey] = {
      lod1Distance: lod1,
      lod2Distance: lod2,
      imposterDistance: thresholds.imposter,
      fadeDistance: thresholds.fadeOut,
    };
  }

  clearLODDistanceCache();

  console.log(
    `[LODConfig] Applied LOD settings for ${Object.keys(settings.distanceThresholds).length} categories`,
  );
}
