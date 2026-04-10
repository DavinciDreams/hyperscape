import { describe, it, expect } from "vitest";
import { zoneReducer } from "@/components/WorldStudio/reducers/zoneReducer";
import type {
  WorldStudioState,
  WorldStudioAction,
} from "@/components/WorldStudio/WorldStudioContext";

// ── Minimal state factory ────────────────────────────────

function makeState(
  overrides?: Partial<{
    tools: Partial<WorldStudioState["tools"]>;
    extendedLayers: Partial<WorldStudioState["extendedLayers"]>;
    builder: Partial<WorldStudioState["builder"]>;
  }>,
): WorldStudioState {
  return {
    tools: {
      activeTool: "select",
      activePlacement: null,
      brushSettings: {},
      cameraTeleportTarget: null,
      transformMode: "translate",
      transformSpace: "world",
      zonePaint: null,
      ...overrides?.tools,
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
      ...overrides?.extendedLayers,
    },
    builder: {
      editing: {
        selection: null,
        ...overrides?.builder?.editing,
      },
      ...overrides?.builder,
    },
  } as unknown as WorldStudioState;
}

// ── Zone Paint Workflow ──────────────────────────────────

describe("zoneReducer — Zone Paint Workflow", () => {
  it("START_ZONE_PAINT activates zone paint mode", () => {
    const result = zoneReducer(makeState(), {
      type: "START_ZONE_PAINT",
      regionId: "r-1",
    } as WorldStudioAction);
    expect(result).not.toBeNull();
    expect(result!.tools.activeTool).toBe("zonePaint");
    expect(result!.tools.zonePaint).toEqual({
      regionId: "r-1",
      brushSize: 1,
      cursorTile: null,
      mode: "paint",
    });
  });

  it("START_ZONE_PAINT preserves existing brush size", () => {
    const state = makeState({
      tools: {
        zonePaint: {
          regionId: "r-0",
          brushSize: 3,
          cursorTile: null,
          mode: "paint",
        },
      },
    });
    const result = zoneReducer(state, {
      type: "START_ZONE_PAINT",
      regionId: "r-1",
    } as WorldStudioAction);
    expect(result!.tools.zonePaint!.brushSize).toBe(3);
  });

  it("START_ZONE_PAINT preserves existing mode", () => {
    const state = makeState({
      tools: {
        zonePaint: {
          regionId: "r-0",
          brushSize: 1,
          cursorTile: null,
          mode: "erase",
        },
      },
    });
    const result = zoneReducer(state, {
      type: "START_ZONE_PAINT",
      regionId: "r-1",
    } as WorldStudioAction);
    expect(result!.tools.zonePaint!.mode).toBe("erase");
  });

  it("UPDATE_ZONE_CURSOR sets cursor tile", () => {
    const state = makeState({
      tools: {
        zonePaint: {
          regionId: "r-1",
          brushSize: 1,
          cursorTile: null,
          mode: "paint",
        },
      },
    });
    const result = zoneReducer(state, {
      type: "UPDATE_ZONE_CURSOR",
      tile: { x: 5, z: 10 },
    } as WorldStudioAction);
    expect(result!.tools.zonePaint!.cursorTile).toEqual({ x: 5, z: 10 });
  });

  it("UPDATE_ZONE_CURSOR returns state unchanged when zonePaint is null", () => {
    const state = makeState();
    const result = zoneReducer(state, {
      type: "UPDATE_ZONE_CURSOR",
      tile: { x: 5, z: 10 },
    } as WorldStudioAction);
    expect(result).toBe(state);
  });

  it("STOP_ZONE_PAINT resets to select mode", () => {
    const state = makeState({
      tools: {
        activeTool: "zonePaint",
        zonePaint: {
          regionId: "r-1",
          brushSize: 1,
          cursorTile: null,
          mode: "paint",
        },
      },
    });
    const result = zoneReducer(state, {
      type: "STOP_ZONE_PAINT",
    } as WorldStudioAction);
    expect(result!.tools.activeTool).toBe("select");
    expect(result!.tools.zonePaint).toBeNull();
  });
});

// ── Zone Brush Settings ──────────────────────────────────

describe("zoneReducer — Zone Brush Settings", () => {
  const paintState = () =>
    makeState({
      tools: {
        zonePaint: {
          regionId: "r-1",
          brushSize: 1,
          cursorTile: null,
          mode: "paint",
        },
      },
    });

  it("SET_ZONE_BRUSH_SIZE updates brush size", () => {
    const result = zoneReducer(paintState(), {
      type: "SET_ZONE_BRUSH_SIZE",
      size: 5,
    } as WorldStudioAction);
    expect(result!.tools.zonePaint!.brushSize).toBe(5);
  });

  it("SET_ZONE_BRUSH_SIZE returns state when zonePaint is null", () => {
    const state = makeState();
    const result = zoneReducer(state, {
      type: "SET_ZONE_BRUSH_SIZE",
      size: 3,
    } as WorldStudioAction);
    expect(result).toBe(state);
  });

  it("SET_ZONE_PAINT_MODE switches to erase", () => {
    const result = zoneReducer(paintState(), {
      type: "SET_ZONE_PAINT_MODE",
      mode: "erase",
    } as WorldStudioAction);
    expect(result!.tools.zonePaint!.mode).toBe("erase");
  });

  it("SET_ZONE_PAINT_MODE returns state when zonePaint is null", () => {
    const state = makeState();
    const result = zoneReducer(state, {
      type: "SET_ZONE_PAINT_MODE",
      mode: "erase",
    } as WorldStudioAction);
    expect(result).toBe(state);
  });
});

// ── PAINT_ZONE_TILES ─────────────────────────────────────

describe("zoneReducer — PAINT_ZONE_TILES", () => {
  const region = { id: "r-1", name: "Forest", tileKeys: ["0,0", "1,0"] };

  it("adds tiles to region", () => {
    const state = makeState({
      extendedLayers: { regions: [region] as never[] },
    });
    const result = zoneReducer(state, {
      type: "PAINT_ZONE_TILES",
      regionId: "r-1",
      tileKeys: ["2,0", "3,0"],
      erase: false,
    } as WorldStudioAction);
    const updated = result!.extendedLayers.regions[0];
    expect(updated.tileKeys).toContain("0,0");
    expect(updated.tileKeys).toContain("2,0");
    expect(updated.tileKeys).toContain("3,0");
    expect(updated.tileKeys).toHaveLength(4);
  });

  it("deduplicates tiles when painting", () => {
    const state = makeState({
      extendedLayers: { regions: [region] as never[] },
    });
    const result = zoneReducer(state, {
      type: "PAINT_ZONE_TILES",
      regionId: "r-1",
      tileKeys: ["0,0", "1,0", "2,0"],
      erase: false,
    } as WorldStudioAction);
    const updated = result!.extendedLayers.regions[0];
    expect(updated.tileKeys).toHaveLength(3); // "0,0", "1,0", "2,0"
  });

  it("erases tiles from region", () => {
    const state = makeState({
      extendedLayers: { regions: [region] as never[] },
    });
    const result = zoneReducer(state, {
      type: "PAINT_ZONE_TILES",
      regionId: "r-1",
      tileKeys: ["0,0"],
      erase: true,
    } as WorldStudioAction);
    const updated = result!.extendedLayers.regions[0];
    expect(updated.tileKeys).toEqual(["1,0"]);
  });

  it("returns state unchanged for missing region", () => {
    const state = makeState({
      extendedLayers: { regions: [region] as never[] },
    });
    const result = zoneReducer(state, {
      type: "PAINT_ZONE_TILES",
      regionId: "r-nonexistent",
      tileKeys: ["2,0"],
      erase: false,
    } as WorldStudioAction);
    expect(result).toBe(state);
  });

  it("does not mutate other regions", () => {
    const r2 = { id: "r-2", name: "Desert", tileKeys: ["10,10"] };
    const state = makeState({
      extendedLayers: { regions: [region, r2] as never[] },
    });
    const result = zoneReducer(state, {
      type: "PAINT_ZONE_TILES",
      regionId: "r-1",
      tileKeys: ["2,0"],
      erase: false,
    } as WorldStudioAction);
    expect(result!.extendedLayers.regions[1].tileKeys).toEqual(["10,10"]);
  });
});

// ── SWITCH_ZONE_PAINT_REGION ─────────────────────────────

describe("zoneReducer — SWITCH_ZONE_PAINT_REGION", () => {
  it("switches region and updates selection", () => {
    const state = makeState({
      tools: {
        zonePaint: {
          regionId: "r-1",
          brushSize: 1,
          cursorTile: null,
          mode: "paint",
        },
      },
    });
    const result = zoneReducer(state, {
      type: "SWITCH_ZONE_PAINT_REGION",
      regionId: "r-2",
    } as WorldStudioAction);
    expect(result!.tools.zonePaint!.regionId).toBe("r-2");
    expect(result!.builder.editing.selection).toEqual({
      type: "region",
      id: "r-2",
      path: [{ type: "region", id: "r-2", name: "" }],
    });
  });

  it("returns state unchanged when zonePaint is null", () => {
    const state = makeState();
    const result = zoneReducer(state, {
      type: "SWITCH_ZONE_PAINT_REGION",
      regionId: "r-2",
    } as WorldStudioAction);
    expect(result).toBe(state);
  });
});

// ── Region CRUD ──────────────────────────────────────────

describe("zoneReducer — Region CRUD", () => {
  const region = { id: "r-1", name: "Forest", tileKeys: [] };

  it("ADD_REGION appends", () => {
    const result = zoneReducer(makeState(), {
      type: "ADD_REGION",
      region,
    } as WorldStudioAction);
    expect(result!.extendedLayers.regions).toHaveLength(1);
    expect(result!.extendedLayers.regions[0]).toEqual(region);
  });

  it("UPDATE_REGION merges by id", () => {
    const state = makeState({
      extendedLayers: { regions: [region] as never[] },
    });
    const result = zoneReducer(state, {
      type: "UPDATE_REGION",
      id: "r-1",
      updates: { name: "Dark Forest" },
    } as WorldStudioAction);
    expect(result!.extendedLayers.regions[0].name).toBe("Dark Forest");
  });

  it("REMOVE_REGION filters by id", () => {
    const state = makeState({
      extendedLayers: { regions: [region] as never[] },
    });
    const result = zoneReducer(state, {
      type: "REMOVE_REGION",
      id: "r-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.regions).toHaveLength(0);
  });

  it("BATCH_ADD_REGIONS appends multiple", () => {
    const r2 = { id: "r-2", name: "Desert", tileKeys: [] };
    const result = zoneReducer(makeState(), {
      type: "BATCH_ADD_REGIONS",
      regions: [region, r2],
    } as WorldStudioAction);
    expect(result!.extendedLayers.regions).toHaveLength(2);
  });
});

// ── Danger Source CRUD ───────────────────────────────────

describe("zoneReducer — Danger Source CRUD", () => {
  const ds = {
    id: "ds-1",
    position: { x: 100, y: 0, z: 100 },
    radius: 50,
    intensity: 0.8,
  };

  it("ADD_DANGER_SOURCE appends", () => {
    const result = zoneReducer(makeState(), {
      type: "ADD_DANGER_SOURCE",
      dangerSource: ds,
    } as WorldStudioAction);
    expect(result!.extendedLayers.dangerSources).toHaveLength(1);
  });

  it("UPDATE_DANGER_SOURCE merges by id", () => {
    const state = makeState({
      extendedLayers: { dangerSources: [ds] as never[] },
    });
    const result = zoneReducer(state, {
      type: "UPDATE_DANGER_SOURCE",
      id: "ds-1",
      updates: { intensity: 1.0 },
    } as WorldStudioAction);
    expect(result!.extendedLayers.dangerSources[0].intensity).toBe(1.0);
  });

  it("REMOVE_DANGER_SOURCE filters by id", () => {
    const state = makeState({
      extendedLayers: { dangerSources: [ds] as never[] },
    });
    const result = zoneReducer(state, {
      type: "REMOVE_DANGER_SOURCE",
      id: "ds-1",
    } as WorldStudioAction);
    expect(result!.extendedLayers.dangerSources).toHaveLength(0);
  });
});

// ── Unhandled actions ────────────────────────────────────

describe("zoneReducer — unhandled actions", () => {
  it("returns null for entity actions", () => {
    const result = zoneReducer(makeState(), {
      type: "ADD_NPC",
      npc: { id: "npc-1" },
    } as WorldStudioAction);
    expect(result).toBeNull();
  });

  it("returns null for UI actions", () => {
    const result = zoneReducer(makeState(), {
      type: "SET_TOOL",
      tool: "select",
    } as WorldStudioAction);
    expect(result).toBeNull();
  });
});

// ── Immutability ─────────────────────────────────────────

describe("zoneReducer — immutability", () => {
  it("does not mutate original regions array", () => {
    const state = makeState();
    const original = state.extendedLayers.regions;
    zoneReducer(state, {
      type: "ADD_REGION",
      region: { id: "r-1", name: "Test", tileKeys: [] },
    } as WorldStudioAction);
    expect(state.extendedLayers.regions).toBe(original);
    expect(state.extendedLayers.regions).toHaveLength(0);
  });

  it("does not mutate region tile keys on paint", () => {
    const region = { id: "r-1", name: "Test", tileKeys: ["0,0"] };
    const state = makeState({
      extendedLayers: { regions: [region] as never[] },
    });
    const originalKeys = region.tileKeys;
    zoneReducer(state, {
      type: "PAINT_ZONE_TILES",
      regionId: "r-1",
      tileKeys: ["1,0"],
      erase: false,
    } as WorldStudioAction);
    expect(originalKeys).toEqual(["0,0"]);
  });
});
