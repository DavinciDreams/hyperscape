import { describe, it, expect } from "vitest";
import { entityReducer } from "@/components/WorldStudio/reducers/entityReducer";
import { zoneReducer } from "@/components/WorldStudio/reducers/zoneReducer";
import { uiReducer } from "@/components/WorldStudio/reducers/uiReducer";
import type {
  WorldStudioState,
  WorldStudioAction,
} from "@/components/WorldStudio/WorldStudioContext";

/**
 * Tests verifying sub-reducer composition: each reducer handles exactly
 * its domain and returns null for all other action types.
 */

function makeState(): WorldStudioState {
  return {
    tools: {
      activeTool: "select",
      activePlacement: null,
      brushSettings: {},
      cameraTeleportTarget: null,
      transformMode: "translate",
      transformSpace: "world",
      zonePaint: null,
    },
    extendedLayers: {
      npcs: [],
      spawnPoints: [],
      teleports: [],
      mobSpawns: [],
      resources: [],
      stations: [],
      pois: [],
      waterBodies: [],
      regions: [],
      dangerSources: [],
      wildernessBoundary: null,
      mines: [],
    },
    brushOverlays: {
      terrainSculpts: [],
      biomePaints: [],
      vegetationPaints: [],
      tileCollisions: [],
    },
    overlays: {
      biomeOverlay: false,
      audioZoneOverlay: false,
      difficultyOverlay: false,
      densityHeatmap: false,
      roadOverlay: false,
      zoneOverlay: false,
      timeOfDay: null,
      weatherPreview: null,
    },
    builder: { editing: { selection: null } },
    gameEntities: null,
    wizardPreview: null,
  } as unknown as WorldStudioState;
}

// Entity actions that SHOULD be handled by entityReducer
const ENTITY_ACTIONS: WorldStudioAction[] = [
  { type: "ADD_NPC", npc: { id: "npc-1" } },
  { type: "UPDATE_NPC", npcId: "npc-1", updates: {} },
  { type: "REMOVE_NPC", npcId: "npc-1" },
  { type: "ADD_SPAWN_POINT", spawnPoint: { id: "sp-1" } },
  { type: "ADD_TELEPORT", teleport: { id: "tp-1" } },
  { type: "ADD_MOB_SPAWN", mobSpawn: { id: "ms-1" } },
  { type: "ADD_RESOURCE", resource: { id: "r-1" } },
  { type: "ADD_STATION", station: { id: "s-1" } },
  { type: "ADD_POI", poi: { id: "p-1" } },
  { type: "ADD_WATER_BODY", waterBody: { id: "w-1" } },
  { type: "ADD_MINE", mine: { id: "m-1" } },
  { type: "SET_WILDERNESS_BOUNDARY", boundary: null },
  { type: "BATCH_ADD_ENTITIES", mobSpawns: [], resources: [] },
  { type: "BATCH_ADD_MINES", mines: [] },
  { type: "CLEAR_ALL_AUTOGEN" },
  { type: "SET_GAME_ENTITIES", data: null },
] as WorldStudioAction[];

// Zone actions that SHOULD be handled by zoneReducer
const ZONE_ACTIONS: WorldStudioAction[] = [
  { type: "START_ZONE_PAINT", regionId: "r-1" },
  { type: "STOP_ZONE_PAINT" },
  { type: "ADD_REGION", region: { id: "r-1", tileKeys: [] } },
  { type: "UPDATE_REGION", id: "r-1", updates: {} },
  { type: "REMOVE_REGION", id: "r-1" },
  { type: "ADD_DANGER_SOURCE", dangerSource: { id: "ds-1" } },
  { type: "UPDATE_DANGER_SOURCE", id: "ds-1", updates: {} },
  { type: "REMOVE_DANGER_SOURCE", id: "ds-1" },
  { type: "BATCH_ADD_REGIONS", regions: [] },
] as WorldStudioAction[];

// UI actions that SHOULD be handled by uiReducer
const UI_ACTIONS: WorldStudioAction[] = [
  { type: "SET_TOOL", tool: "brush" },
  { type: "SET_TRANSFORM_MODE", mode: "rotate" },
  { type: "SET_TRANSFORM_SPACE", space: "local" },
  { type: "CAMERA_TELEPORT", target: { x: 0, y: 0, z: 0 } },
  { type: "CAMERA_TELEPORT_CONSUMED" },
  {
    type: "START_PLACEMENT",
    category: "npc",
    templateId: "t",
    templateName: "T",
  },
  { type: "CANCEL_PLACEMENT" },
  { type: "SET_BRUSH_SETTINGS", settings: {} },
  { type: "ADD_TERRAIN_SCULPT", stroke: {} },
  { type: "ADD_BIOME_PAINT", stroke: {} },
  { type: "ADD_VEGETATION_PAINT", stroke: {} },
  { type: "SET_TILE_COLLISION", tiles: [] },
  { type: "SET_OVERLAY", overlay: {} },
  { type: "SET_WIZARD_PREVIEW", preview: {} },
  { type: "CLEAR_WIZARD_PREVIEW" },
] as WorldStudioAction[];

describe("reducer composition — entity reducer handles only entity actions", () => {
  for (const action of ENTITY_ACTIONS) {
    it(`entityReducer handles ${action.type}`, () => {
      expect(entityReducer(makeState(), action)).not.toBeNull();
    });
  }

  for (const action of ZONE_ACTIONS) {
    it(`entityReducer ignores zone action: ${action.type}`, () => {
      expect(entityReducer(makeState(), action)).toBeNull();
    });
  }

  for (const action of UI_ACTIONS) {
    it(`entityReducer ignores UI action: ${action.type}`, () => {
      expect(entityReducer(makeState(), action)).toBeNull();
    });
  }
});

describe("reducer composition — zone reducer handles only zone actions", () => {
  for (const action of ZONE_ACTIONS) {
    it(`zoneReducer handles ${action.type}`, () => {
      expect(zoneReducer(makeState(), action)).not.toBeNull();
    });
  }

  for (const action of ENTITY_ACTIONS) {
    it(`zoneReducer ignores entity action: ${action.type}`, () => {
      expect(zoneReducer(makeState(), action)).toBeNull();
    });
  }

  for (const action of UI_ACTIONS) {
    it(`zoneReducer ignores UI action: ${action.type}`, () => {
      expect(zoneReducer(makeState(), action)).toBeNull();
    });
  }
});

describe("reducer composition — UI reducer handles only UI actions", () => {
  for (const action of UI_ACTIONS) {
    it(`uiReducer handles ${action.type}`, () => {
      expect(uiReducer(makeState(), action)).not.toBeNull();
    });
  }

  for (const action of ENTITY_ACTIONS) {
    it(`uiReducer ignores entity action: ${action.type}`, () => {
      expect(uiReducer(makeState(), action)).toBeNull();
    });
  }

  for (const action of ZONE_ACTIONS) {
    it(`uiReducer ignores zone action: ${action.type}`, () => {
      expect(uiReducer(makeState(), action)).toBeNull();
    });
  }
});
