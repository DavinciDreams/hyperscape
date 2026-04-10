import { describe, it, expect } from "vitest";
import { entityReducer } from "@/components/WorldStudio/reducers/entityReducer";
import type {
  WorldStudioState,
  WorldStudioAction,
} from "@/components/WorldStudio/WorldStudioContext";

// ── Minimal state factory ────────────────────────────────

function makeState(
  overrides: Partial<WorldStudioState["extendedLayers"]> = {},
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
      ...overrides,
    },
    gameEntities: null,
  } as unknown as WorldStudioState;
}

// ── NPC CRUD ─────────────────────────────────────────────

describe("entityReducer — NPC CRUD", () => {
  const npc = { id: "npc-1", name: "Guard", position: { x: 0, y: 0, z: 0 } };

  it("ADD_NPC appends to npcs array", () => {
    const result = entityReducer(makeState(), {
      type: "ADD_NPC",
      npc,
    } as WorldStudioAction);
    expect(result).not.toBeNull();
    expect(result!.extendedLayers.npcs).toHaveLength(1);
    expect(result!.extendedLayers.npcs[0]).toEqual(npc);
  });

  it("UPDATE_NPC merges updates by id", () => {
    const state = makeState({ npcs: [npc] as never[] });
    const result = entityReducer(state, {
      type: "UPDATE_NPC",
      npcId: "npc-1",
      updates: { name: "Elite Guard" },
    } as WorldStudioAction);
    expect(result!.extendedLayers.npcs[0].name).toBe("Elite Guard");
  });

  it("UPDATE_NPC does not modify unmatched npcs", () => {
    const npc2 = { id: "npc-2", name: "Merchant" };
    const state = makeState({ npcs: [npc, npc2] as never[] });
    const result = entityReducer(state, {
      type: "UPDATE_NPC",
      npcId: "npc-1",
      updates: { name: "Elite Guard" },
    } as WorldStudioAction);
    expect(result!.extendedLayers.npcs[1].name).toBe("Merchant");
  });

  it("REMOVE_NPC filters by id", () => {
    const state = makeState({ npcs: [npc] as never[] });
    const result = entityReducer(state, {
      type: "REMOVE_NPC",
      npcId: "npc-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.npcs).toHaveLength(0);
  });

  it("REMOVE_NPC preserves other npcs", () => {
    const npc2 = { id: "npc-2", name: "Merchant" };
    const state = makeState({ npcs: [npc, npc2] as never[] });
    const result = entityReducer(state, {
      type: "REMOVE_NPC",
      npcId: "npc-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.npcs).toHaveLength(1);
    expect(result!.extendedLayers.npcs[0].id).toBe("npc-2");
  });
});

// ── Spawn Point CRUD ─────────────────────────────────────

describe("entityReducer — Spawn Point CRUD", () => {
  const sp = { id: "sp-1", position: { x: 10, y: 0, z: 10 } };

  it("ADD_SPAWN_POINT appends", () => {
    const result = entityReducer(makeState(), {
      type: "ADD_SPAWN_POINT",
      spawnPoint: sp,
    } as WorldStudioAction);
    expect(result!.extendedLayers.spawnPoints).toHaveLength(1);
  });

  it("UPDATE_SPAWN_POINT merges by id", () => {
    const state = makeState({ spawnPoints: [sp] as never[] });
    const result = entityReducer(state, {
      type: "UPDATE_SPAWN_POINT",
      id: "sp-1",
      updates: { position: { x: 20, y: 0, z: 20 } },
    } as WorldStudioAction);
    expect(result!.extendedLayers.spawnPoints[0].position.x).toBe(20);
  });

  it("REMOVE_SPAWN_POINT filters by id", () => {
    const state = makeState({ spawnPoints: [sp] as never[] });
    const result = entityReducer(state, {
      type: "REMOVE_SPAWN_POINT",
      id: "sp-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.spawnPoints).toHaveLength(0);
  });
});

// ── Teleport CRUD ────────────────────────────────────────

describe("entityReducer — Teleport CRUD", () => {
  const tp = { id: "tp-1", name: "Town Gate", position: { x: 0, y: 0, z: 0 } };

  it("ADD_TELEPORT appends", () => {
    const result = entityReducer(makeState(), {
      type: "ADD_TELEPORT",
      teleport: tp,
    } as WorldStudioAction);
    expect(result!.extendedLayers.teleports).toHaveLength(1);
  });

  it("UPDATE_TELEPORT merges by id", () => {
    const state = makeState({ teleports: [tp] as never[] });
    const result = entityReducer(state, {
      type: "UPDATE_TELEPORT",
      id: "tp-1",
      updates: { name: "Castle Gate" },
    } as WorldStudioAction);
    expect(result!.extendedLayers.teleports[0].name).toBe("Castle Gate");
  });

  it("REMOVE_TELEPORT filters by id", () => {
    const state = makeState({ teleports: [tp] as never[] });
    const result = entityReducer(state, {
      type: "REMOVE_TELEPORT",
      id: "tp-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.teleports).toHaveLength(0);
  });
});

// ── Mob Spawn CRUD ───────────────────────────────────────

describe("entityReducer — Mob Spawn CRUD", () => {
  const mob = {
    id: "mob-1",
    mobId: "goblin",
    source: "hand-placed" as const,
    position: { x: 50, y: 0, z: 50 },
  };

  it("ADD_MOB_SPAWN appends", () => {
    const result = entityReducer(makeState(), {
      type: "ADD_MOB_SPAWN",
      mobSpawn: mob,
    } as WorldStudioAction);
    expect(result!.extendedLayers.mobSpawns).toHaveLength(1);
  });

  it("UPDATE_MOB_SPAWN merges updates", () => {
    const state = makeState({ mobSpawns: [mob] as never[] });
    const result = entityReducer(state, {
      type: "UPDATE_MOB_SPAWN",
      id: "mob-1",
      updates: { mobId: "ogre" },
    } as WorldStudioAction);
    expect(result!.extendedLayers.mobSpawns[0].mobId).toBe("ogre");
  });

  it("UPDATE_MOB_SPAWN converts procgen source to hand-placed", () => {
    const procgenMob = {
      ...mob,
      id: "autogen-mob-1",
      source: "procgen" as const,
    };
    const state = makeState({ mobSpawns: [procgenMob] as never[] });
    const result = entityReducer(state, {
      type: "UPDATE_MOB_SPAWN",
      id: "autogen-mob-1",
      updates: { mobId: "troll" },
    } as WorldStudioAction);
    expect(result!.extendedLayers.mobSpawns[0].source).toBe("hand-placed");
  });

  it("UPDATE_MOB_SPAWN preserves hand-placed source", () => {
    const state = makeState({ mobSpawns: [mob] as never[] });
    const result = entityReducer(state, {
      type: "UPDATE_MOB_SPAWN",
      id: "mob-1",
      updates: { mobId: "troll" },
    } as WorldStudioAction);
    expect(result!.extendedLayers.mobSpawns[0].source).toBe("hand-placed");
  });

  it("REMOVE_MOB_SPAWN filters by id", () => {
    const state = makeState({ mobSpawns: [mob] as never[] });
    const result = entityReducer(state, {
      type: "REMOVE_MOB_SPAWN",
      id: "mob-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.mobSpawns).toHaveLength(0);
  });
});

// ── Resource CRUD ────────────────────────────────────────

describe("entityReducer — Resource CRUD", () => {
  const res = {
    id: "res-1",
    resourceId: "oak-tree",
    source: "hand-placed" as const,
    position: { x: 30, y: 0, z: 30 },
  };

  it("ADD_RESOURCE appends", () => {
    const result = entityReducer(makeState(), {
      type: "ADD_RESOURCE",
      resource: res,
    } as WorldStudioAction);
    expect(result!.extendedLayers.resources).toHaveLength(1);
  });

  it("UPDATE_RESOURCE converts procgen to hand-placed", () => {
    const procgenRes = {
      ...res,
      id: "autogen-res-1",
      source: "procgen" as const,
    };
    const state = makeState({ resources: [procgenRes] as never[] });
    const result = entityReducer(state, {
      type: "UPDATE_RESOURCE",
      id: "autogen-res-1",
      updates: { resourceId: "yew-tree" },
    } as WorldStudioAction);
    expect(result!.extendedLayers.resources[0].source).toBe("hand-placed");
    expect(result!.extendedLayers.resources[0].resourceId).toBe("yew-tree");
  });

  it("REMOVE_RESOURCE filters by id", () => {
    const state = makeState({ resources: [res] as never[] });
    const result = entityReducer(state, {
      type: "REMOVE_RESOURCE",
      id: "res-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.resources).toHaveLength(0);
  });
});

// ── Station CRUD ─────────────────────────────────────────

describe("entityReducer — Station CRUD", () => {
  const station = {
    id: "sta-1",
    stationType: "bank",
    source: "hand-placed" as const,
    position: { x: 0, y: 0, z: 0 },
  };

  it("ADD_STATION appends", () => {
    const result = entityReducer(makeState(), {
      type: "ADD_STATION",
      station,
    } as WorldStudioAction);
    expect(result!.extendedLayers.stations).toHaveLength(1);
  });

  it("UPDATE_STATION converts procgen to hand-placed", () => {
    const procgenSta = { ...station, source: "procgen" as const };
    const state = makeState({ stations: [procgenSta] as never[] });
    const result = entityReducer(state, {
      type: "UPDATE_STATION",
      id: "sta-1",
      updates: { stationType: "forge" },
    } as WorldStudioAction);
    expect(result!.extendedLayers.stations[0].source).toBe("hand-placed");
  });

  it("REMOVE_STATION filters by id", () => {
    const state = makeState({ stations: [station] as never[] });
    const result = entityReducer(state, {
      type: "REMOVE_STATION",
      id: "sta-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.stations).toHaveLength(0);
  });
});

// ── POI CRUD ─────────────────────────────────────────────

describe("entityReducer — POI CRUD", () => {
  const poi = {
    id: "poi-1",
    name: "Ancient Ruins",
    position: { x: 0, y: 0, z: 0 },
  };

  it("ADD_POI appends", () => {
    const result = entityReducer(makeState(), {
      type: "ADD_POI",
      poi,
    } as WorldStudioAction);
    expect(result!.extendedLayers.pois).toHaveLength(1);
  });

  it("UPDATE_POI merges by id", () => {
    const state = makeState({ pois: [poi] as never[] });
    const result = entityReducer(state, {
      type: "UPDATE_POI",
      id: "poi-1",
      updates: { name: "Dragon's Lair" },
    } as WorldStudioAction);
    expect(result!.extendedLayers.pois[0].name).toBe("Dragon's Lair");
  });

  it("REMOVE_POI filters by id", () => {
    const state = makeState({ pois: [poi] as never[] });
    const result = entityReducer(state, {
      type: "REMOVE_POI",
      id: "poi-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.pois).toHaveLength(0);
  });
});

// ── Water Body CRUD ──────────────────────────────────────

describe("entityReducer — Water Body CRUD", () => {
  const water = { id: "w-1", type: "lake", position: { x: 0, y: 0, z: 0 } };

  it("ADD_WATER_BODY appends", () => {
    const result = entityReducer(makeState(), {
      type: "ADD_WATER_BODY",
      waterBody: water,
    } as WorldStudioAction);
    expect(result!.extendedLayers.waterBodies).toHaveLength(1);
  });

  it("UPDATE_WATER_BODY merges by id", () => {
    const state = makeState({ waterBodies: [water] as never[] });
    const result = entityReducer(state, {
      type: "UPDATE_WATER_BODY",
      id: "w-1",
      updates: { type: "river" },
    } as WorldStudioAction);
    expect(result!.extendedLayers.waterBodies[0].type).toBe("river");
  });

  it("REMOVE_WATER_BODY filters by id", () => {
    const state = makeState({ waterBodies: [water] as never[] });
    const result = entityReducer(state, {
      type: "REMOVE_WATER_BODY",
      id: "w-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.waterBodies).toHaveLength(0);
  });
});

// ── Mine CRUD ────────────────────────────────────────────

describe("entityReducer — Mine CRUD", () => {
  const mine = {
    id: "mine-1",
    source: "hand-placed",
    position: { x: 0, y: 0, z: 0 },
  };

  it("ADD_MINE appends", () => {
    const result = entityReducer(makeState(), {
      type: "ADD_MINE",
      mine,
    } as WorldStudioAction);
    expect(result!.extendedLayers.mines).toHaveLength(1);
  });

  it("BATCH_ADD_MINES appends multiple", () => {
    const mine2 = {
      id: "mine-2",
      source: "procgen",
      position: { x: 50, y: 0, z: 50 },
    };
    const result = entityReducer(makeState(), {
      type: "BATCH_ADD_MINES",
      mines: [mine, mine2],
    } as WorldStudioAction);
    expect(result!.extendedLayers.mines).toHaveLength(2);
  });

  it("REMOVE_MINE filters by id", () => {
    const state = makeState({ mines: [mine] as never[] });
    const result = entityReducer(state, {
      type: "REMOVE_MINE",
      id: "mine-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.mines).toHaveLength(0);
  });
});

// ── Wilderness Boundary ──────────────────────────────────

describe("entityReducer — Wilderness Boundary", () => {
  it("SET_WILDERNESS_BOUNDARY sets boundary", () => {
    const boundary = {
      points: [
        { x: 0, z: 0 },
        { x: 100, z: 100 },
      ],
    };
    const result = entityReducer(makeState(), {
      type: "SET_WILDERNESS_BOUNDARY",
      boundary,
    } as WorldStudioAction);
    expect(result!.extendedLayers.wildernessBoundary).toEqual(boundary);
  });

  it("SET_WILDERNESS_BOUNDARY can clear with null", () => {
    const state = makeState({
      wildernessBoundary: { points: [] } as never,
    });
    const result = entityReducer(state, {
      type: "SET_WILDERNESS_BOUNDARY",
      boundary: null,
    } as WorldStudioAction);
    expect(result!.extendedLayers.wildernessBoundary).toBeNull();
  });
});

// ── Batch Operations ─────────────────────────────────────

describe("entityReducer — Batch Operations", () => {
  it("BATCH_ADD_ENTITIES adds mobs and resources", () => {
    const mob = { id: "autogen-mob-1", source: "procgen" };
    const res = { id: "autogen-res-1", source: "procgen" };
    const result = entityReducer(makeState(), {
      type: "BATCH_ADD_ENTITIES",
      mobSpawns: [mob],
      resources: [res],
    } as WorldStudioAction);
    expect(result!.extendedLayers.mobSpawns).toHaveLength(1);
    expect(result!.extendedLayers.resources).toHaveLength(1);
  });

  it("BATCH_ADD_ENTITIES appends to existing", () => {
    const existing = { id: "mob-1", source: "hand-placed" };
    const state = makeState({ mobSpawns: [existing] as never[] });
    const result = entityReducer(state, {
      type: "BATCH_ADD_ENTITIES",
      mobSpawns: [{ id: "autogen-mob-1", source: "procgen" }],
      resources: [],
    } as WorldStudioAction);
    expect(result!.extendedLayers.mobSpawns).toHaveLength(2);
  });
});

// ── CLEAR_ALL_AUTOGEN ────────────────────────────────────

describe("entityReducer — CLEAR_ALL_AUTOGEN", () => {
  it("removes autogen mobs and resources", () => {
    const state = makeState({
      mobSpawns: [
        { id: "autogen-mob-1", source: "procgen" },
        { id: "mob-2", source: "hand-placed" },
      ] as never[],
      resources: [
        { id: "autogen-res-1", source: "procgen" },
        { id: "res-2", source: "hand-placed" },
      ] as never[],
      spawnPoints: [{ id: "autogen-sp-1" }, { id: "sp-2" }] as never[],
      teleports: [{ id: "autogen-tp-1" }, { id: "tp-2" }] as never[],
      mines: [
        { id: "mine-1", source: "procgen" },
        { id: "mine-2", source: "hand-placed" },
      ] as never[],
      regions: [
        { id: "r-1", autoGenBounds: true },
        { id: "r-2", autoGenBounds: undefined },
      ] as never[],
    });
    const result = entityReducer(state, {
      type: "CLEAR_ALL_AUTOGEN",
    } as WorldStudioAction);

    expect(result!.extendedLayers.mobSpawns).toHaveLength(1);
    expect(result!.extendedLayers.mobSpawns[0].id).toBe("mob-2");

    expect(result!.extendedLayers.resources).toHaveLength(1);
    expect(result!.extendedLayers.resources[0].id).toBe("res-2");

    expect(result!.extendedLayers.spawnPoints).toHaveLength(1);
    expect(result!.extendedLayers.spawnPoints[0].id).toBe("sp-2");

    expect(result!.extendedLayers.teleports).toHaveLength(1);
    expect(result!.extendedLayers.teleports[0].id).toBe("tp-2");

    expect(result!.extendedLayers.mines).toHaveLength(1);
    expect(result!.extendedLayers.mines[0].id).toBe("mine-2");

    expect(result!.extendedLayers.regions).toHaveLength(1);
    expect(result!.extendedLayers.regions[0].id).toBe("r-2");
  });

  it("preserves procgen mobs that don't have autogen prefix", () => {
    const state = makeState({
      mobSpawns: [{ id: "procgen-mob-1", source: "procgen" }] as never[],
    });
    const result = entityReducer(state, {
      type: "CLEAR_ALL_AUTOGEN",
    } as WorldStudioAction);
    // procgen source but no "autogen-" prefix → kept
    expect(result!.extendedLayers.mobSpawns).toHaveLength(1);
  });
});

// ── SET_GAME_ENTITIES ────────────────────────────────────

describe("entityReducer — SET_GAME_ENTITIES", () => {
  it("sets game entity data", () => {
    const data = { areas: [], towns: [] };
    const result = entityReducer(makeState(), {
      type: "SET_GAME_ENTITIES",
      data,
    } as WorldStudioAction);
    expect(result!.gameEntities).toEqual(data);
  });

  it("replaces existing data", () => {
    const state = {
      ...makeState(),
      gameEntities: { areas: ["old"] },
    } as unknown as WorldStudioState;
    const result = entityReducer(state, {
      type: "SET_GAME_ENTITIES",
      data: { areas: ["new"] },
    } as WorldStudioAction);
    expect(result!.gameEntities).toEqual({ areas: ["new"] });
  });
});

// ── Unhandled actions ────────────────────────────────────

describe("entityReducer — unhandled actions", () => {
  it("returns null for unknown action types", () => {
    const result = entityReducer(makeState(), {
      type: "SET_TOOL",
      tool: "select",
    } as WorldStudioAction);
    expect(result).toBeNull();
  });

  it("returns null for zone actions", () => {
    const result = entityReducer(makeState(), {
      type: "ADD_REGION",
      region: { id: "r-1" },
    } as WorldStudioAction);
    expect(result).toBeNull();
  });
});

// ── Immutability ─────────────────────────────────────────

describe("entityReducer — immutability", () => {
  it("does not mutate original state on ADD", () => {
    const state = makeState();
    const originalNpcs = state.extendedLayers.npcs;
    entityReducer(state, {
      type: "ADD_NPC",
      npc: { id: "npc-1" },
    } as WorldStudioAction);
    expect(state.extendedLayers.npcs).toBe(originalNpcs);
    expect(state.extendedLayers.npcs).toHaveLength(0);
  });

  it("does not mutate original state on REMOVE", () => {
    const npc = { id: "npc-1", name: "Guard" };
    const state = makeState({ npcs: [npc] as never[] });
    const originalNpcs = state.extendedLayers.npcs;
    entityReducer(state, {
      type: "REMOVE_NPC",
      npcId: "npc-1",
    } as WorldStudioAction);
    expect(state.extendedLayers.npcs).toBe(originalNpcs);
    expect(state.extendedLayers.npcs).toHaveLength(1);
  });

  it("returns new state object reference on change", () => {
    const state = makeState();
    const result = entityReducer(state, {
      type: "ADD_NPC",
      npc: { id: "npc-1" },
    } as WorldStudioAction);
    expect(result).not.toBe(state);
    expect(result!.extendedLayers).not.toBe(state.extendedLayers);
  });
});
