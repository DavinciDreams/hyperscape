/**
 * World Systems
 * Environment, terrain, sky, water, vegetation, towns, roads, POIs, and atmospheric effects
 */

export * from "./Environment";
export * from "./TerrainSystem";
export * from "./TerrainShader";
export * from "./SkySystem";
export * from "./WaterMaterialCore";
export * from "./SceneLightingCore";
export * from "./WaterSystem";
export * from "./WaterBodyRegistry";
export * from "./Wind";
export * from "./VegetationSsboUtils";
// VegetationSystem migrated to @hyperforge/hyperscape (2026-04-25)
// ProceduralGrass migrated to @hyperforge/hyperscape (2026-04-25)
export * from "./GrassMaterialCore";
export * from "./StandaloneGrass";
// ProceduralFlowers migrated to @hyperforge/hyperscape (2026-04-25)
// ProceduralDocks migrated to @hyperforge/hyperscape (2026-04-25)
export * from "./TownSystem";
// POISystem migrated to @hyperforge/hyperscape (2026-04-25)
// RoadNetworkSystem migrated to @hyperforge/hyperscape (2026-04-25)
// BuildingRenderingSystem migrated to @hyperforge/hyperscape (2026-04-25)
// ProceduralTownLandmarks migrated to @hyperforge/hyperscape (2026-04-25)
export * from "./BuildingCollisionService";
export * from "./GrassExclusionManager";
export * from "./ProcgenRockCache";
export * from "./ProcgenRockInstancer";
export * from "./ProcgenPlantCache";
export * from "./ProcgenPlantInstancer";
export * from "./ProcgenTreeCache";
export * from "./ProcgenTreeInstancer";
export * from "./AtlasedTreeImpostors";

// Teleport Network
// TeleportSystem migrated to @hyperforge/hyperscape (2026-04-25)

// Tree LOD System (consolidated tree baking and rendering)
export * from "./TreeLODSystem";
export * from "./TreeLODMaterials";
export * from "./TreeLODIntegration";

// Waterfall geometry/positioning helper. Type re-exported for the
// hyperscape-plugin's WaterfallVisualsSystem.
export * from "./WaterfallDefinition";
