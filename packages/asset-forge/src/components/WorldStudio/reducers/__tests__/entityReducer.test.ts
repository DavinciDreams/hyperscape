/**
 * Unit tests for the entity sub-reducer.
 *
 * Each action type handled by entityReducer is exercised with minimal but
 * complete assertions.  The mock state is cast via `as WorldStudioState` so
 * we only need the fields the reducer actually touches.
 */

import { describe, it, expect } from "vitest";
import { entityReducer } from "../entityReducer";
import type {
  WorldStudioState,
  WorldStudioAction,
} from "../../worldStudioTypes";
import type {
  PlacedSpawnPoint,
  PlacedTeleport,
  PlacedMobSpawn,
  PlacedResource,
  PlacedStation,
  PlacedMine,
  PlacedPOI,
  PlacedWaterBody,
  PlacedRegion,
  PlacedCustomAsset,
  WildernessBoundary,
  Prefab,
  AudioLayers,
  ExtendedWorldLayers,
} from "../../types";
import type { PlacedNPC } from "../../../WorldBuilder/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pos = { x: 0, y: 0, z: 0 };

function createMinimalState(
  overrides?: Partial<{
    extendedLayers: Partial<ExtendedWorldLayers>;
    prefabs: Prefab[];
  }>,
): WorldStudioState {
  return {
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
      customAssets: [],
      ...overrides?.extendedLayers,
    },
    prefabs: overrides?.prefabs ?? [],
    gameEntities: null,
    audioLayers: { musicZones: [], ambientZones: [], sfxTriggers: [] },
  } as WorldStudioState;
}

function makeNPC(id: string): PlacedNPC {
  return {
    id,
    npcTypeId: "guard",
    name: `NPC ${id}`,
    position: pos,
    rotation: 0,
    parentContext: { type: "world" },
    dialogueKey: "",
    properties: {},
  } as PlacedNPC;
}

function makeSpawnPoint(id: string): PlacedSpawnPoint {
  return {
    id,
    name: `SP ${id}`,
    position: pos,
    rotation: 0,
    spawnType: "initial",
    capacity: 1,
    properties: {},
  };
}

function makeTeleport(id: string): PlacedTeleport {
  return {
    id,
    name: `TP ${id}`,
    position: pos,
    connections: [],
    requirements: {},
    cost: 0,
    properties: {},
  };
}

function makeMobSpawn(
  id: string,
  source?: "hand-placed" | "procgen",
): PlacedMobSpawn {
  return {
    id,
    mobId: "goblin",
    name: `Mob ${id}`,
    position: pos,
    spawnRadius: 5,
    maxCount: 3,
    respawnTicks: 100,
    source,
    properties: {},
  };
}

function makeResource(
  id: string,
  source?: "hand-placed" | "procgen",
): PlacedResource {
  return {
    id,
    resourceId: "ore_copper",
    resourceType: "mining",
    name: `Resource ${id}`,
    position: pos,
    rotation: 0,
    modelVariant: 0,
    source,
    properties: {},
  };
}

function makeStation(
  id: string,
  source?: "hand-placed" | "procgen",
): PlacedStation {
  return {
    id,
    stationType: "anvil",
    name: `Station ${id}`,
    position: pos,
    rotation: 0,
    source,
    properties: {},
  };
}

function makePOI(id: string): PlacedPOI {
  return {
    id,
    name: `POI ${id}`,
    category: "landmark",
    position: pos,
    importance: 0.5,
    radius: 10,
    connectedRoads: [],
    properties: {},
  };
}

function makeWaterBody(id: string): PlacedWaterBody {
  return {
    id,
    name: `Water ${id}`,
    bodyType: "lake",
    properties: {},
  };
}

function makeMine(
  id: string,
  source: "hand-placed" | "procgen" = "hand-placed",
): PlacedMine {
  return {
    id,
    name: `Mine ${id}`,
    position: pos,
    radius: 20,
    radialOffsets: [1, 1, 1, 1, 1, 1, 1, 1],
    entryAngle: 0,
    biome: "grassland",
    tierIndex: 0,
    oreRocks: [{ resourceId: "ore_copper", count: 5 }],
    source,
    properties: {},
  };
}

function makeCustomAsset(id: string): PlacedCustomAsset {
  return {
    id,
    name: `Asset ${id}`,
    assetId: "asset-001",
    assetName: "Barrel",
    position: pos,
    rotation: 0,
    scale: 1,
    properties: {},
  };
}

function makeRegion(id: string, autoGenBounds?: boolean): PlacedRegion {
  return {
    id,
    name: `Region ${id}`,
    description: "",
    tileKeys: [],
    tags: [],
    ...(autoGenBounds
      ? {
          autoGenBounds: {
            difficultyRange: [0, 1] as [number, number],
            biomeFilter: null,
            boundingBox: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 },
          },
        }
      : {}),
  } as PlacedRegion;
}

function makePrefab(id: string): Prefab {
  return {
    id,
    name: `Prefab ${id}`,
    entries: [],
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("entityReducer", () => {
  // ===================== NPC CRUD =====================

  describe("NPC CRUD", () => {
    it("ADD_NPC appends to npcs array", () => {
      const state = createMinimalState();
      const npc = makeNPC("npc-1");
      const result = entityReducer(state, { type: "ADD_NPC", npc });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.npcs).toHaveLength(1);
      expect(result!.extendedLayers.npcs[0].id).toBe("npc-1");
    });

    it("UPDATE_NPC updates the correct NPC", () => {
      const state = createMinimalState({
        extendedLayers: { npcs: [makeNPC("npc-1"), makeNPC("npc-2")] },
      });
      const result = entityReducer(state, {
        type: "UPDATE_NPC",
        npcId: "npc-1",
        updates: { name: "Updated" },
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.npcs[0].name).toBe("Updated");
      expect(result!.extendedLayers.npcs[1].name).toBe("NPC npc-2");
    });

    it("REMOVE_NPC removes only the target NPC", () => {
      const state = createMinimalState({
        extendedLayers: { npcs: [makeNPC("npc-1"), makeNPC("npc-2")] },
      });
      const result = entityReducer(state, {
        type: "REMOVE_NPC",
        npcId: "npc-1",
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.npcs).toHaveLength(1);
      expect(result!.extendedLayers.npcs[0].id).toBe("npc-2");
    });
  });

  // ===================== SPAWN POINT CRUD =====================

  describe("Spawn Point CRUD", () => {
    it("ADD_SPAWN_POINT appends to spawnPoints array", () => {
      const state = createMinimalState();
      const sp = makeSpawnPoint("sp-1");
      const result = entityReducer(state, {
        type: "ADD_SPAWN_POINT",
        spawnPoint: sp,
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.spawnPoints).toHaveLength(1);
      expect(result!.extendedLayers.spawnPoints[0].id).toBe("sp-1");
    });

    it("UPDATE_SPAWN_POINT updates the correct spawn point", () => {
      const state = createMinimalState({
        extendedLayers: { spawnPoints: [makeSpawnPoint("sp-1")] },
      });
      const result = entityReducer(state, {
        type: "UPDATE_SPAWN_POINT",
        id: "sp-1",
        updates: { capacity: 10 },
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.spawnPoints[0].capacity).toBe(10);
    });

    it("REMOVE_SPAWN_POINT removes the target", () => {
      const state = createMinimalState({
        extendedLayers: {
          spawnPoints: [makeSpawnPoint("sp-1"), makeSpawnPoint("sp-2")],
        },
      });
      const result = entityReducer(state, {
        type: "REMOVE_SPAWN_POINT",
        id: "sp-1",
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.spawnPoints).toHaveLength(1);
      expect(result!.extendedLayers.spawnPoints[0].id).toBe("sp-2");
    });
  });

  // ===================== TELEPORT CRUD =====================

  describe("Teleport CRUD", () => {
    it("ADD_TELEPORT appends to teleports array", () => {
      const state = createMinimalState();
      const result = entityReducer(state, {
        type: "ADD_TELEPORT",
        teleport: makeTeleport("tp-1"),
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.teleports).toHaveLength(1);
    });

    it("UPDATE_TELEPORT updates the correct teleport", () => {
      const state = createMinimalState({
        extendedLayers: { teleports: [makeTeleport("tp-1")] },
      });
      const result = entityReducer(state, {
        type: "UPDATE_TELEPORT",
        id: "tp-1",
        updates: { cost: 50 },
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.teleports[0].cost).toBe(50);
    });

    it("REMOVE_TELEPORT removes the target", () => {
      const state = createMinimalState({
        extendedLayers: { teleports: [makeTeleport("tp-1")] },
      });
      const result = entityReducer(state, {
        type: "REMOVE_TELEPORT",
        id: "tp-1",
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.teleports).toHaveLength(0);
    });
  });

  // ===================== MOB SPAWN CRUD (source-tracking) =====================

  describe("Mob Spawn CRUD (source tracking)", () => {
    it("ADD_MOB_SPAWN appends to mobSpawns array", () => {
      const state = createMinimalState();
      const result = entityReducer(state, {
        type: "ADD_MOB_SPAWN",
        mobSpawn: makeMobSpawn("mob-1"),
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.mobSpawns).toHaveLength(1);
    });

    it("UPDATE_MOB_SPAWN promotes procgen to hand-placed", () => {
      const state = createMinimalState({
        extendedLayers: { mobSpawns: [makeMobSpawn("mob-1", "procgen")] },
      });
      const result = entityReducer(state, {
        type: "UPDATE_MOB_SPAWN",
        id: "mob-1",
        updates: { maxCount: 10 },
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.mobSpawns[0].source).toBe("hand-placed");
      expect(result!.extendedLayers.mobSpawns[0].maxCount).toBe(10);
    });

    it("UPDATE_MOB_SPAWN leaves hand-placed source unchanged", () => {
      const state = createMinimalState({
        extendedLayers: { mobSpawns: [makeMobSpawn("mob-1", "hand-placed")] },
      });
      const result = entityReducer(state, {
        type: "UPDATE_MOB_SPAWN",
        id: "mob-1",
        updates: { maxCount: 10 },
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.mobSpawns[0].source).toBe("hand-placed");
    });

    it("REMOVE_MOB_SPAWN removes the target", () => {
      const state = createMinimalState({
        extendedLayers: { mobSpawns: [makeMobSpawn("mob-1")] },
      });
      const result = entityReducer(state, {
        type: "REMOVE_MOB_SPAWN",
        id: "mob-1",
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.mobSpawns).toHaveLength(0);
    });
  });

  // ===================== RESOURCE CRUD (source-tracking) =====================

  describe("Resource CRUD (source tracking)", () => {
    it("ADD_RESOURCE appends to resources array", () => {
      const state = createMinimalState();
      const result = entityReducer(state, {
        type: "ADD_RESOURCE",
        resource: makeResource("res-1"),
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.resources).toHaveLength(1);
    });

    it("UPDATE_RESOURCE promotes procgen to hand-placed", () => {
      const state = createMinimalState({
        extendedLayers: { resources: [makeResource("res-1", "procgen")] },
      });
      const result = entityReducer(state, {
        type: "UPDATE_RESOURCE",
        id: "res-1",
        updates: { name: "Edited" },
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.resources[0].source).toBe("hand-placed");
      expect(result!.extendedLayers.resources[0].name).toBe("Edited");
    });

    it("UPDATE_RESOURCE leaves hand-placed source unchanged", () => {
      const state = createMinimalState({
        extendedLayers: { resources: [makeResource("res-1", "hand-placed")] },
      });
      const result = entityReducer(state, {
        type: "UPDATE_RESOURCE",
        id: "res-1",
        updates: { name: "Edited" },
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.resources[0].source).toBe("hand-placed");
    });

    it("REMOVE_RESOURCE removes the target", () => {
      const state = createMinimalState({
        extendedLayers: { resources: [makeResource("res-1")] },
      });
      const result = entityReducer(state, {
        type: "REMOVE_RESOURCE",
        id: "res-1",
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.resources).toHaveLength(0);
    });
  });

  // ===================== STATION CRUD (source-tracking) =====================

  describe("Station CRUD (source tracking)", () => {
    it("ADD_STATION appends to stations array", () => {
      const state = createMinimalState();
      const result = entityReducer(state, {
        type: "ADD_STATION",
        station: makeStation("st-1"),
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.stations).toHaveLength(1);
    });

    it("UPDATE_STATION promotes procgen to hand-placed", () => {
      const state = createMinimalState({
        extendedLayers: { stations: [makeStation("st-1", "procgen")] },
      });
      const result = entityReducer(state, {
        type: "UPDATE_STATION",
        id: "st-1",
        updates: { name: "Edited" },
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.stations[0].source).toBe("hand-placed");
    });

    it("REMOVE_STATION removes the target", () => {
      const state = createMinimalState({
        extendedLayers: { stations: [makeStation("st-1")] },
      });
      const result = entityReducer(state, {
        type: "REMOVE_STATION",
        id: "st-1",
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.stations).toHaveLength(0);
    });
  });

  // ===================== POI CRUD =====================

  describe("POI CRUD", () => {
    it("ADD_POI appends to pois array", () => {
      const state = createMinimalState();
      const result = entityReducer(state, {
        type: "ADD_POI",
        poi: makePOI("poi-1"),
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.pois).toHaveLength(1);
    });

    it("UPDATE_POI updates the correct POI", () => {
      const state = createMinimalState({
        extendedLayers: { pois: [makePOI("poi-1")] },
      });
      const result = entityReducer(state, {
        type: "UPDATE_POI",
        id: "poi-1",
        updates: { importance: 0.9 },
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.pois[0].importance).toBe(0.9);
    });

    it("REMOVE_POI removes the target", () => {
      const state = createMinimalState({
        extendedLayers: { pois: [makePOI("poi-1")] },
      });
      const result = entityReducer(state, { type: "REMOVE_POI", id: "poi-1" });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.pois).toHaveLength(0);
    });
  });

  // ===================== WATER BODY CRUD =====================

  describe("Water Body CRUD", () => {
    it("ADD_WATER_BODY appends to waterBodies array", () => {
      const state = createMinimalState();
      const result = entityReducer(state, {
        type: "ADD_WATER_BODY",
        waterBody: makeWaterBody("wb-1"),
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.waterBodies).toHaveLength(1);
    });

    it("UPDATE_WATER_BODY updates the correct water body", () => {
      const state = createMinimalState({
        extendedLayers: { waterBodies: [makeWaterBody("wb-1")] },
      });
      const result = entityReducer(state, {
        type: "UPDATE_WATER_BODY",
        id: "wb-1",
        updates: { surfaceY: 42 },
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.waterBodies[0].surfaceY).toBe(42);
    });

    it("REMOVE_WATER_BODY removes the target", () => {
      const state = createMinimalState({
        extendedLayers: { waterBodies: [makeWaterBody("wb-1")] },
      });
      const result = entityReducer(state, {
        type: "REMOVE_WATER_BODY",
        id: "wb-1",
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.waterBodies).toHaveLength(0);
    });
  });

  // ===================== MINE CRUD + BATCH =====================

  describe("Mine CRUD and batch", () => {
    it("ADD_MINE appends to mines array", () => {
      const state = createMinimalState();
      const result = entityReducer(state, {
        type: "ADD_MINE",
        mine: makeMine("mine-1"),
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.mines).toHaveLength(1);
    });

    it("REMOVE_MINE removes the target", () => {
      const state = createMinimalState({
        extendedLayers: { mines: [makeMine("mine-1")] },
      });
      const result = entityReducer(state, {
        type: "REMOVE_MINE",
        id: "mine-1",
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.mines).toHaveLength(0);
    });

    it("BATCH_ADD_MINES appends multiple mines", () => {
      const state = createMinimalState({
        extendedLayers: { mines: [makeMine("mine-existing")] },
      });
      const newMines = [makeMine("mine-2"), makeMine("mine-3")];
      const result = entityReducer(state, {
        type: "BATCH_ADD_MINES",
        mines: newMines,
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.mines).toHaveLength(3);
      expect(result!.extendedLayers.mines.map((m) => m.id)).toEqual([
        "mine-existing",
        "mine-2",
        "mine-3",
      ]);
    });
  });

  // ===================== CUSTOM ASSET CRUD =====================

  describe("Custom Asset CRUD", () => {
    it("ADD_CUSTOM_ASSET appends to customAssets array", () => {
      const state = createMinimalState();
      const result = entityReducer(state, {
        type: "ADD_CUSTOM_ASSET",
        asset: makeCustomAsset("ca-1"),
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.customAssets).toHaveLength(1);
    });

    it("UPDATE_CUSTOM_ASSET updates the correct custom asset", () => {
      const state = createMinimalState({
        extendedLayers: { customAssets: [makeCustomAsset("ca-1")] },
      });
      const result = entityReducer(state, {
        type: "UPDATE_CUSTOM_ASSET",
        id: "ca-1",
        updates: { scale: 2 },
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.customAssets[0].scale).toBe(2);
    });

    it("REMOVE_CUSTOM_ASSET removes the target", () => {
      const state = createMinimalState({
        extendedLayers: { customAssets: [makeCustomAsset("ca-1")] },
      });
      const result = entityReducer(state, {
        type: "REMOVE_CUSTOM_ASSET",
        id: "ca-1",
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.customAssets).toHaveLength(0);
    });
  });

  // ===================== WILDERNESS BOUNDARY =====================

  describe("SET_WILDERNESS_BOUNDARY", () => {
    it("sets the wilderness boundary", () => {
      const state = createMinimalState();
      const boundary: WildernessBoundary = {
        points: [
          { x: 0, z: 0 },
          { x: 100, z: 0 },
        ],
        levelScale: 10,
        maxLevel: 50,
      };
      const result = entityReducer(state, {
        type: "SET_WILDERNESS_BOUNDARY",
        boundary,
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.wildernessBoundary).toBe(boundary);
    });

    it("clears the wilderness boundary with null", () => {
      const state = createMinimalState({
        extendedLayers: {
          wildernessBoundary: { points: [], levelScale: 10, maxLevel: 50 },
        },
      });
      const result = entityReducer(state, {
        type: "SET_WILDERNESS_BOUNDARY",
        boundary: null,
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.wildernessBoundary).toBeNull();
    });
  });

  // ===================== BATCH_ADD_ENTITIES =====================

  describe("BATCH_ADD_ENTITIES", () => {
    it("appends mobSpawns and resources to existing arrays", () => {
      const state = createMinimalState({
        extendedLayers: {
          mobSpawns: [makeMobSpawn("existing-mob")],
          resources: [makeResource("existing-res")],
        },
      });
      const result = entityReducer(state, {
        type: "BATCH_ADD_ENTITIES",
        mobSpawns: [makeMobSpawn("new-mob-1"), makeMobSpawn("new-mob-2")],
        resources: [makeResource("new-res-1")],
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.mobSpawns).toHaveLength(3);
      expect(result!.extendedLayers.resources).toHaveLength(2);
    });

    it("does not touch other arrays", () => {
      const npc = makeNPC("npc-1");
      const state = createMinimalState({
        extendedLayers: { npcs: [npc] },
      });
      const result = entityReducer(state, {
        type: "BATCH_ADD_ENTITIES",
        mobSpawns: [makeMobSpawn("mob-1")],
        resources: [],
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers.npcs).toHaveLength(1);
      expect(result!.extendedLayers.npcs[0]).toBe(npc);
    });
  });

  // ===================== CLEAR_ALL_AUTOGEN =====================

  describe("CLEAR_ALL_AUTOGEN", () => {
    it("removes procgen entities while keeping hand-placed ones", () => {
      const state = createMinimalState({
        extendedLayers: {
          regions: [
            makeRegion("autogen-region", true),
            makeRegion("hand-region", false),
          ],
          mobSpawns: [
            makeMobSpawn("autogen-mob-1", "procgen"),
            makeMobSpawn("hand-mob", "hand-placed"),
          ],
          resources: [
            makeResource("autogen-res-1", "procgen"),
            makeResource("hand-res", "hand-placed"),
          ],
          spawnPoints: [
            makeSpawnPoint("autogen-sp-1"),
            makeSpawnPoint("sp-manual"),
          ],
          teleports: [makeTeleport("autogen-tp-1"), makeTeleport("tp-manual")],
          mines: [
            makeMine("mine-1", "procgen"),
            makeMine("mine-2", "hand-placed"),
          ],
        },
      });

      const result = entityReducer(state, { type: "CLEAR_ALL_AUTOGEN" });
      expect(result).not.toBeNull();

      // Regions: only non-autoGenBounds kept
      expect(result!.extendedLayers.regions).toHaveLength(1);
      expect(result!.extendedLayers.regions[0].id).toBe("hand-region");

      // Mob spawns: procgen with autogen- prefix removed
      expect(result!.extendedLayers.mobSpawns).toHaveLength(1);
      expect(result!.extendedLayers.mobSpawns[0].id).toBe("hand-mob");

      // Resources: procgen with autogen- prefix removed
      expect(result!.extendedLayers.resources).toHaveLength(1);
      expect(result!.extendedLayers.resources[0].id).toBe("hand-res");

      // Spawn points: autogen- prefix removed
      expect(result!.extendedLayers.spawnPoints).toHaveLength(1);
      expect(result!.extendedLayers.spawnPoints[0].id).toBe("sp-manual");

      // Teleports: autogen- prefix removed
      expect(result!.extendedLayers.teleports).toHaveLength(1);
      expect(result!.extendedLayers.teleports[0].id).toBe("tp-manual");

      // Mines: procgen source removed
      expect(result!.extendedLayers.mines).toHaveLength(1);
      expect(result!.extendedLayers.mines[0].id).toBe("mine-2");
    });

    it("keeps procgen mob/resource without autogen- prefix", () => {
      const state = createMinimalState({
        extendedLayers: {
          mobSpawns: [makeMobSpawn("custom-mob-1", "procgen")],
          resources: [makeResource("custom-res-1", "procgen")],
        },
      });
      const result = entityReducer(state, { type: "CLEAR_ALL_AUTOGEN" });
      expect(result).not.toBeNull();
      // procgen entities without "autogen-" prefix are kept
      expect(result!.extendedLayers.mobSpawns).toHaveLength(1);
      expect(result!.extendedLayers.resources).toHaveLength(1);
    });
  });

  // ===================== PREFAB CRUD =====================

  describe("Prefab CRUD", () => {
    it("ADD_PREFAB appends to state.prefabs", () => {
      const state = createMinimalState();
      const prefab = makePrefab("pf-1");
      const result = entityReducer(state, { type: "ADD_PREFAB", prefab });
      expect(result).not.toBeNull();
      expect(result!.prefabs).toHaveLength(1);
      expect(result!.prefabs[0].id).toBe("pf-1");
    });

    it("UPDATE_PREFAB updates the correct prefab", () => {
      const state = createMinimalState({
        prefabs: [makePrefab("pf-1"), makePrefab("pf-2")],
      });
      const result = entityReducer(state, {
        type: "UPDATE_PREFAB",
        id: "pf-1",
        updates: { name: "Updated Prefab" },
      });
      expect(result).not.toBeNull();
      expect(result!.prefabs[0].name).toBe("Updated Prefab");
      expect(result!.prefabs[1].name).toBe("Prefab pf-2");
    });

    it("REMOVE_PREFAB removes only the target prefab", () => {
      const state = createMinimalState({
        prefabs: [makePrefab("pf-1"), makePrefab("pf-2")],
      });
      const result = entityReducer(state, {
        type: "REMOVE_PREFAB",
        id: "pf-1",
      });
      expect(result).not.toBeNull();
      expect(result!.prefabs).toHaveLength(1);
      expect(result!.prefabs[0].id).toBe("pf-2");
    });
  });

  // ===================== SET_GAME_ENTITIES =====================

  describe("SET_GAME_ENTITIES", () => {
    it("sets gameEntities on state", () => {
      const state = createMinimalState();
      const data = {
        mobs: [],
        resources: [],
      } as unknown as WorldStudioState["gameEntities"];
      const result = entityReducer(state, {
        type: "SET_GAME_ENTITIES",
        data,
      } as WorldStudioAction);
      expect(result).not.toBeNull();
      expect(result!.gameEntities).toBe(data);
    });
  });

  // ===================== BULK RESTORE =====================

  describe("Bulk restore actions", () => {
    it("RESTORE_EXTENDED_LAYERS replaces extendedLayers entirely", () => {
      const state = createMinimalState({
        extendedLayers: { npcs: [makeNPC("old")] },
      });
      const newLayers: ExtendedWorldLayers = {
        npcs: [makeNPC("new-1"), makeNPC("new-2")],
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
        customAssets: [],
      };
      const result = entityReducer(state, {
        type: "RESTORE_EXTENDED_LAYERS",
        layers: newLayers,
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers).toBe(newLayers);
      expect(result!.extendedLayers.npcs).toHaveLength(2);
    });

    it("RESTORE_AUDIO_LAYERS replaces audioLayers entirely", () => {
      const state = createMinimalState();
      const newAudio: AudioLayers = {
        musicZones: [
          {
            id: "mz-1",
            name: "Zone",
            trackId: "t1",
            polygon: [],
            priority: 1,
            blendDistance: 5,
            properties: {},
          } as AudioLayers["musicZones"][0],
        ],
        ambientZones: [],
        sfxTriggers: [],
      };
      const result = entityReducer(state, {
        type: "RESTORE_AUDIO_LAYERS",
        layers: newAudio,
      });
      expect(result).not.toBeNull();
      expect(result!.audioLayers).toBe(newAudio);
    });

    it("RESTORE_PREFABS replaces prefabs entirely", () => {
      const state = createMinimalState({ prefabs: [makePrefab("old")] });
      const newPrefabs = [makePrefab("pf-a"), makePrefab("pf-b")];
      const result = entityReducer(state, {
        type: "RESTORE_PREFABS",
        prefabs: newPrefabs,
      });
      expect(result).not.toBeNull();
      expect(result!.prefabs).toBe(newPrefabs);
      expect(result!.prefabs).toHaveLength(2);
    });
  });

  // ===================== UNKNOWN ACTION =====================

  describe("Unknown action", () => {
    it("returns null for an unhandled action type", () => {
      const state = createMinimalState();
      const result = entityReducer(state, {
        type: "SET_TOOL",
        tool: "select",
      } as WorldStudioAction);
      expect(result).toBeNull();
    });

    it("returns null for a completely unknown action type", () => {
      const state = createMinimalState();
      const result = entityReducer(state, {
        type: "TOTALLY_UNKNOWN",
      } as unknown as WorldStudioAction);
      expect(result).toBeNull();
    });
  });

  // ===================== IMMUTABILITY =====================

  describe("Immutability", () => {
    it("does not mutate the original state on ADD", () => {
      const state = createMinimalState();
      const originalNpcs = state.extendedLayers.npcs;
      entityReducer(state, { type: "ADD_NPC", npc: makeNPC("npc-1") });
      expect(state.extendedLayers.npcs).toBe(originalNpcs);
      expect(state.extendedLayers.npcs).toHaveLength(0);
    });

    it("does not mutate the original state on UPDATE", () => {
      const npc = makeNPC("npc-1");
      const state = createMinimalState({
        extendedLayers: { npcs: [npc] },
      });
      entityReducer(state, {
        type: "UPDATE_NPC",
        npcId: "npc-1",
        updates: { name: "Changed" },
      });
      expect(state.extendedLayers.npcs[0].name).toBe("NPC npc-1");
    });

    it("does not mutate the original state on REMOVE", () => {
      const state = createMinimalState({
        extendedLayers: { npcs: [makeNPC("npc-1")] },
      });
      entityReducer(state, { type: "REMOVE_NPC", npcId: "npc-1" });
      expect(state.extendedLayers.npcs).toHaveLength(1);
    });

    it("returns a new extendedLayers reference", () => {
      const state = createMinimalState();
      const result = entityReducer(state, {
        type: "ADD_NPC",
        npc: makeNPC("npc-1"),
      });
      expect(result).not.toBeNull();
      expect(result!.extendedLayers).not.toBe(state.extendedLayers);
    });
  });
});
