/**
 * Tier configuration constants for the zone auto-generation pipeline.
 *
 * Extracted from useZoneAutoGen to keep the hook thin and allow
 * non-React code (pipeline stages, overlays) to share the same defaults.
 */

import type { DifficultyTierConfig, AutoGenConfig } from "../../types";

// Tier scalar ranges calibrated to the distance-primary auto-gen formula:
//   scalar = distanceFromTown/(worldRadius*0.75) * biomeModifier + noise
//
// With biome modifiers (0.5 → 1.5), scalars at key distances from town:
//   100m  plains(0.60):  0.13*0.60=0.08  tundra(1.50): 0.13*1.50=0.20
//   250m  plains: 0.22   tundra: 0.50
//   500m  plains: 0.40   tundra: 1.00
//   750m+ plains: 0.60   tundra: 1.50 (clamped to 1.0)
//
// This gives every biome 4-6 visible tiers as you walk away from town.
// Mob levelRange uses overlap: mob [mobMin..mobMax] overlaps [tierMin..tierMax]
export const DEFAULT_TIERS: DifficultyTierConfig[] = [
  {
    name: "Safe",
    scalarRange: [0.0, 0.08],
    levelRange: [0, 0],
    resourceLevelRange: [1, 5],
    namePrefix: "Safe",
    color: "#2e7d32",
    mobDensityMultiplier: 0,
    resourceDensityMultiplier: 2.0,
    mobResourceBuffer: 30,
  },
  {
    name: "Beginner",
    scalarRange: [0.08, 0.2],
    levelRange: [1, 10],
    resourceLevelRange: [1, 20],
    namePrefix: "Beginner",
    color: "#66bb6a",
    mobDensityMultiplier: 0.3,
    resourceDensityMultiplier: 1.5,
    mobResourceBuffer: 25,
  },
  {
    name: "Low",
    scalarRange: [0.2, 0.35],
    levelRange: [5, 25],
    resourceLevelRange: [10, 45],
    namePrefix: "Low",
    color: "#fdd835",
    mobDensityMultiplier: 0.6,
    resourceDensityMultiplier: 1.0,
    mobResourceBuffer: 20,
  },
  {
    name: "Mid",
    scalarRange: [0.35, 0.55],
    levelRange: [15, 45],
    resourceLevelRange: [30, 65],
    namePrefix: "Mid",
    color: "#ff9800",
    mobDensityMultiplier: 1.0,
    resourceDensityMultiplier: 0.6,
    mobResourceBuffer: 12,
  },
  {
    name: "High",
    scalarRange: [0.55, 0.78],
    levelRange: [25, 60],
    resourceLevelRange: [50, 85],
    namePrefix: "Dangerous",
    color: "#d32f2f",
    mobDensityMultiplier: 1.5,
    resourceDensityMultiplier: 0.3,
    mobResourceBuffer: 8,
  },
  {
    name: "Extreme",
    scalarRange: [0.78, 1.0],
    levelRange: [40, 200],
    resourceLevelRange: [65, 99],
    namePrefix: "Extreme",
    color: "#6a1b9a",
    mobDensityMultiplier: 2.0,
    resourceDensityMultiplier: 0.15,
    mobResourceBuffer: 3,
  },
];

export const DEFAULT_AUTOGEN_CONFIG: AutoGenConfig = {
  gridResolution: 10,
  minZoneArea: 5000,
  maxZoneSpan: 500,
  seed: 42,
  tiers: DEFAULT_TIERS,
  mobSpacing: 15,
  resourceSpacing: 8,
};
