/**
 * vegetationZones — Zone-aware vegetation density multipliers
 *
 * Provides a density multiplier map that the VegetationPlacer can use
 * to reduce/increase vegetation based on zone type, POIs, and features.
 *
 * No ECS dependencies — operates on plain data.
 */

// ============== TYPES ==============

/** An area where vegetation density is modified */
export interface VegetationModifier {
  /** Center of the affected area */
  center: { x: number; z: number };
  /** Radius of effect (meters) */
  radius: number;
  /** Density multiplier (0 = no vegetation, 1 = normal, 1.5 = extra dense) */
  multiplier: number;
  /** Source that created this modifier */
  source: string;
}

/** Zone reference for density multiplier extraction */
export interface VegetationZoneRef {
  id: string;
  name: string;
  tierName: string;
  /** Bounding box of the zone */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Zone centroid */
  centroid: { x: number; z: number };
  /** Zone area in m² */
  area: number;
}

/** POI reference for clearing generation */
export interface VegetationPOIRef {
  id: string;
  category: string;
  position: { x: number; z: number };
  radius: number;
}

/** Vegetation zone config */
export interface VegetationZoneConfig {
  /** Multiplier per tier name (e.g., "Safe" → 1.0, "Extreme" → 0.3) */
  tierMultipliers: Record<string, number>;
  /** POI clearing multipliers by category */
  poiClearingMultipliers: Record<
    string,
    { multiplier: number; radius: number }
  >;
  /** Mining area clearing config */
  miningClearing: {
    /** Vegetation multiplier near mining resources (default 0.3) */
    multiplier: number;
    /** Radius of vegetation clearing around mining spots (meters, default 12) */
    radius: number;
  };
  /** Dense forest zone bonus (added to base biome density, default 1.5) */
  denseForestMultiplier: number;
}

export const DEFAULT_VEG_ZONE_CONFIG: VegetationZoneConfig = {
  tierMultipliers: {
    Safe: 1.2,
    Beginner: 1.0,
    Low: 0.9,
    Mid: 0.7,
    High: 0.5,
    Extreme: 0.3,
  },
  poiClearingMultipliers: {
    camp: { multiplier: 0.1, radius: 15 },
    ruin: { multiplier: 0.2, radius: 20 },
    resource_area: { multiplier: 0.15, radius: 20 },
    shrine: { multiplier: 0.3, radius: 8 },
    dungeon: { multiplier: 0.2, radius: 15 },
    waystation: { multiplier: 0.2, radius: 8 },
    landmark: { multiplier: 0.4, radius: 10 },
    crossing: { multiplier: 0.3, radius: 8 },
    fishing_spot: { multiplier: 0.5, radius: 8 },
  },
  miningClearing: {
    multiplier: 0.3,
    radius: 12,
  },
  denseForestMultiplier: 1.5,
};

// ============== MODIFIER GENERATION ==============

/** Resource position reference for mining clearing */
export interface MiningResourceRef {
  position: { x: number; z: number };
  type: string;
}

/**
 * Generate vegetation modifiers from zones, POIs, and mining resources.
 *
 * These modifiers create clearings around camps, reduce vegetation in
 * dangerous zones, and ensure mining areas are accessible.
 *
 * @param pois - POIs that need vegetation clearing
 * @param miningResources - Mining resource positions
 * @param config - Zone config (defaults applied)
 * @returns Array of vegetation modifiers
 */
export function generateVegetationModifiers(
  pois: VegetationPOIRef[],
  miningResources: MiningResourceRef[],
  config: Partial<VegetationZoneConfig> = {},
): VegetationModifier[] {
  const cfg = { ...DEFAULT_VEG_ZONE_CONFIG, ...config };
  const modifiers: VegetationModifier[] = [];

  // 1. POI clearings
  for (const poi of pois) {
    const clearing = cfg.poiClearingMultipliers[poi.category];
    if (clearing) {
      modifiers.push({
        center: poi.position,
        radius: clearing.radius,
        multiplier: clearing.multiplier,
        source: `poi_${poi.id}`,
      });
    }
  }

  // 2. Mining resource clearings
  for (const resource of miningResources) {
    modifiers.push({
      center: resource.position,
      radius: cfg.miningClearing.radius,
      multiplier: cfg.miningClearing.multiplier,
      source: `mining_${resource.type}`,
    });
  }

  return modifiers;
}

/**
 * Query the effective vegetation density multiplier at a world position.
 *
 * Evaluates all modifiers and returns the minimum multiplier (most restrictive)
 * that applies to the given position. Returns 1.0 if no modifier applies.
 *
 * This function is designed to be called per-tile by VegetationPlacer during
 * tile generation. For performance, callers should pre-filter modifiers to
 * only those within range of the tile being generated.
 *
 * @param x - World X coordinate
 * @param z - World Z coordinate
 * @param modifiers - Active vegetation modifiers
 * @returns Density multiplier (0-2, where 1 = normal)
 */
export function queryVegetationDensity(
  x: number,
  z: number,
  modifiers: VegetationModifier[],
): number {
  let result = 1.0;

  for (const mod of modifiers) {
    const dx = x - mod.center.x;
    const dz = z - mod.center.z;
    const distSq = dx * dx + dz * dz;
    const radiusSq = mod.radius * mod.radius;

    if (distSq < radiusSq) {
      // Smooth falloff: full effect at center, fades at edge
      const dist = Math.sqrt(distSq);
      const t = dist / mod.radius; // 0 at center, 1 at edge
      const falloff = 1 - t * t; // Quadratic falloff
      const effective = 1.0 + (mod.multiplier - 1.0) * falloff;
      result = Math.min(result, effective);
    }
  }

  return Math.max(0, result);
}

/**
 * Get the tier-based vegetation multiplier for a zone.
 * Used for broad density adjustments across entire zones.
 *
 * @param tierName - Zone tier name (e.g., "Safe", "Beginner", "Extreme")
 * @param config - Zone config
 * @returns Density multiplier for the tier
 */
export function getTierVegetationMultiplier(
  tierName: string,
  config: Partial<VegetationZoneConfig> = {},
): number {
  const cfg = { ...DEFAULT_VEG_ZONE_CONFIG, ...config };
  return cfg.tierMultipliers[tierName] ?? 1.0;
}
