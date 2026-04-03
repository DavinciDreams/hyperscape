/**
 * World generation utilities — pure logic extracted from ECS systems
 *
 * These utilities can be used by both the runtime (ECS systems) and
 * the editor (World Studio) without ECS infrastructure dependencies.
 */

export {
  type BuildingNPCSpawn,
  type BuildingInfo,
  BUILDING_NPC_TYPES,
  extractBuildingNPC,
  extractTownNPCs,
} from "./townPopulation";

export {
  type RoadTerrainQuerier,
  type RoadEndpoint,
  type GraphEdge,
  type RoadGenConfig,
  type GeneratedRoad,
  DEFAULT_ROAD_CONFIG,
  buildEdges,
  buildMST,
  selectExtraEdges,
  findPath,
  generateDirectPath,
  smoothPath,
  generateRoads,
} from "./roadGeneration";

export {
  type POITerrainQuerier,
  type POITownRef,
  type POIGenConfig,
  CATEGORY_PROPERTIES,
  DEFAULT_POI_COUNTS,
  generatePOIs,
  generatePOIName,
  findWaterEdge,
  calculatePOIEntryPoint,
} from "./poiPlacement";

export {
  type DockTerrainQuerier,
  type DockTownRef,
  type DockGenConfig,
  type DockCandidate,
  type PlacedDock,
  DEFAULT_DOCK_CONFIG,
  scoreShorelinePosition,
  generateDocks,
} from "./dockPlacement";

export {
  type StoreBuilding,
  type StoreNPCEntry,
  type StoreAssignment,
  type TownSizeCategory,
  BUILDING_STORE_MAP,
  TOWN_SIZE_STORES,
  assignStores,
  buildStoreMap,
} from "./storeAssignment";

export {
  type QuestTerrainQuerier,
  type PlacementRules,
  type PlacementTownRef,
  type QuestNPCToPlace,
  type PlacedQuestNPC,
  placeQuestNPCs,
  extractQuestNPCsToPlace,
} from "./questNPCPlacement";
