import { describe, it, expect } from "vitest";
import { uiReducer } from "@/components/WorldStudio/reducers/uiReducer";
import type {
  WorldStudioState,
  WorldStudioAction,
} from "@/components/WorldStudio/WorldStudioContext";

// ── Minimal state factory ────────────────────────────────

function makeState(
  overrides?: Partial<{
    tools: Partial<WorldStudioState["tools"]>;
    brushOverlays: Partial<WorldStudioState["brushOverlays"]>;
    overlays: Partial<WorldStudioState["overlays"]>;
    builder: Partial<WorldStudioState["builder"]>;
    extendedLayers: Partial<WorldStudioState["extendedLayers"]>;
  }>,
): WorldStudioState {
  return {
    tools: {
      activeTool: "select",
      activePlacement: null,
      brushSettings: { radius: 5, strength: 0.5, falloff: "smooth" },
      cameraTeleportTarget: null,
      transformMode: "translate",
      transformSpace: "world",
      zonePaint: null,
      ...overrides?.tools,
    },
    brushOverlays: {
      terrainSculpts: [],
      biomePaints: [],
      vegetationPaints: [],
      tileCollisions: [],
      ...overrides?.brushOverlays,
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
      ...overrides?.overlays,
    },
    wizardPreview: null,
    builder: {
      editing: { selection: null },
      ...overrides?.builder,
    },
    extendedLayers: {
      regions: [],
      ...overrides?.extendedLayers,
    },
  } as unknown as WorldStudioState;
}

// ── Tool Switching ───────────────────────────────────────

describe("uiReducer — SET_TOOL", () => {
  it("switches active tool", () => {
    const result = uiReducer(makeState(), {
      type: "SET_TOOL",
      tool: "brush",
    } as WorldStudioAction);
    expect(result).not.toBeNull();
    expect(result!.tools.activeTool).toBe("brush");
  });

  it("clears active placement when switching away from place", () => {
    const state = makeState({
      tools: {
        activeTool: "place",
        activePlacement: {
          category: "npc",
          templateId: "guard",
          templateName: "Guard",
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
          confirmed: false,
        },
      },
    });
    const result = uiReducer(state, {
      type: "SET_TOOL",
      tool: "select",
    } as WorldStudioAction);
    expect(result!.tools.activePlacement).toBeNull();
  });

  it("preserves placement when staying on place tool", () => {
    const placement = {
      category: "npc",
      templateId: "guard",
      templateName: "Guard",
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      confirmed: false,
    };
    const state = makeState({
      tools: { activeTool: "place", activePlacement: placement },
    });
    const result = uiReducer(state, {
      type: "SET_TOOL",
      tool: "place",
    } as WorldStudioAction);
    expect(result!.tools.activePlacement).toEqual(placement);
  });

  it("clears zone paint when switching away from zonePaint", () => {
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
    const result = uiReducer(state, {
      type: "SET_TOOL",
      tool: "select",
    } as WorldStudioAction);
    expect(result!.tools.zonePaint).toBeNull();
  });

  it("auto-starts zone paint when switching to zonePaint with regions", () => {
    const state = makeState({
      extendedLayers: {
        regions: [{ id: "r-1", name: "Forest" }] as never[],
      },
    });
    const result = uiReducer(state, {
      type: "SET_TOOL",
      tool: "zonePaint",
    } as WorldStudioAction);
    expect(result!.tools.zonePaint).not.toBeNull();
    expect(result!.tools.zonePaint!.regionId).toBe("r-1");
  });

  it("uses selected region when switching to zonePaint", () => {
    const state = makeState({
      extendedLayers: {
        regions: [
          { id: "r-1", name: "Forest" },
          { id: "r-2", name: "Desert" },
        ] as never[],
      },
      builder: {
        editing: { selection: { type: "region", id: "r-2" } },
      },
    });
    const result = uiReducer(state, {
      type: "SET_TOOL",
      tool: "zonePaint",
    } as WorldStudioAction);
    expect(result!.tools.zonePaint!.regionId).toBe("r-2");
  });
});

// ── Transform ────────────────────────────────────────────

describe("uiReducer — Transform", () => {
  it("SET_TRANSFORM_MODE changes mode", () => {
    const result = uiReducer(makeState(), {
      type: "SET_TRANSFORM_MODE",
      mode: "rotate",
    } as WorldStudioAction);
    expect(result!.tools.transformMode).toBe("rotate");
  });

  it("SET_TRANSFORM_SPACE changes space", () => {
    const result = uiReducer(makeState(), {
      type: "SET_TRANSFORM_SPACE",
      space: "local",
    } as WorldStudioAction);
    expect(result!.tools.transformSpace).toBe("local");
  });
});

// ── Camera Teleport ──────────────────────────────────────

describe("uiReducer — Camera Teleport", () => {
  it("CAMERA_TELEPORT sets target", () => {
    const target = { x: 100, y: 50, z: 200 };
    const result = uiReducer(makeState(), {
      type: "CAMERA_TELEPORT",
      target,
    } as WorldStudioAction);
    expect(result!.tools.cameraTeleportTarget).toEqual(target);
  });

  it("CAMERA_TELEPORT_CONSUMED clears target", () => {
    const state = makeState({
      tools: { cameraTeleportTarget: { x: 100, y: 50, z: 200 } },
    });
    const result = uiReducer(state, {
      type: "CAMERA_TELEPORT_CONSUMED",
    } as WorldStudioAction);
    expect(result!.tools.cameraTeleportTarget).toBeNull();
  });
});

// ── Placement Workflow ───────────────────────────────────

describe("uiReducer — Placement Workflow", () => {
  it("START_PLACEMENT activates place tool with template", () => {
    const result = uiReducer(makeState(), {
      type: "START_PLACEMENT",
      category: "station",
      templateId: "bank",
      templateName: "Bank",
    } as WorldStudioAction);
    expect(result!.tools.activeTool).toBe("place");
    expect(result!.tools.activePlacement).toEqual({
      category: "station",
      templateId: "bank",
      templateName: "Bank",
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      confirmed: false,
    });
  });

  it("UPDATE_PLACEMENT_POSITION updates position", () => {
    const state = makeState({
      tools: {
        activePlacement: {
          category: "npc",
          templateId: "guard",
          templateName: "Guard",
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
          confirmed: false,
        },
      },
    });
    const result = uiReducer(state, {
      type: "UPDATE_PLACEMENT_POSITION",
      position: { x: 10, y: 0, z: 20 },
      rotation: 1.5,
    } as WorldStudioAction);
    expect(result!.tools.activePlacement!.position).toEqual({
      x: 10,
      y: 0,
      z: 20,
    });
    expect(result!.tools.activePlacement!.rotation).toBe(1.5);
  });

  it("UPDATE_PLACEMENT_POSITION preserves rotation when not provided", () => {
    const state = makeState({
      tools: {
        activePlacement: {
          category: "npc",
          templateId: "guard",
          templateName: "Guard",
          position: { x: 0, y: 0, z: 0 },
          rotation: 2.0,
          confirmed: false,
        },
      },
    });
    const result = uiReducer(state, {
      type: "UPDATE_PLACEMENT_POSITION",
      position: { x: 10, y: 0, z: 20 },
    } as WorldStudioAction);
    expect(result!.tools.activePlacement!.rotation).toBe(2.0);
  });

  it("UPDATE_PLACEMENT_POSITION returns state when no active placement", () => {
    const state = makeState();
    const result = uiReducer(state, {
      type: "UPDATE_PLACEMENT_POSITION",
      position: { x: 10, y: 0, z: 20 },
    } as WorldStudioAction);
    expect(result).toBe(state);
  });

  it("CONFIRM_PLACEMENT marks as confirmed", () => {
    const state = makeState({
      tools: {
        activePlacement: {
          category: "npc",
          templateId: "guard",
          templateName: "Guard",
          position: { x: 10, y: 0, z: 20 },
          rotation: 0,
          confirmed: false,
        },
      },
    });
    const result = uiReducer(state, {
      type: "CONFIRM_PLACEMENT",
    } as WorldStudioAction);
    expect(result!.tools.activePlacement!.confirmed).toBe(true);
  });

  it("CONFIRM_PLACEMENT returns state when no active placement", () => {
    const state = makeState();
    const result = uiReducer(state, {
      type: "CONFIRM_PLACEMENT",
    } as WorldStudioAction);
    expect(result).toBe(state);
  });

  it("CANCEL_PLACEMENT clears placement and switches to select", () => {
    const state = makeState({
      tools: {
        activeTool: "place",
        activePlacement: {
          category: "npc",
          templateId: "guard",
          templateName: "Guard",
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
          confirmed: false,
        },
      },
    });
    const result = uiReducer(state, {
      type: "CANCEL_PLACEMENT",
    } as WorldStudioAction);
    expect(result!.tools.activeTool).toBe("select");
    expect(result!.tools.activePlacement).toBeNull();
  });
});

// ── Brush Settings ───────────────────────────────────────

describe("uiReducer — Brush Settings", () => {
  it("SET_BRUSH_SETTINGS merges settings", () => {
    const result = uiReducer(makeState(), {
      type: "SET_BRUSH_SETTINGS",
      settings: { radius: 10, strength: 1.0 },
    } as WorldStudioAction);
    expect(result!.tools.brushSettings.radius).toBe(10);
    expect(result!.tools.brushSettings.strength).toBe(1.0);
    expect(result!.tools.brushSettings.falloff).toBe("smooth");
  });
});

// ── Brush Strokes ────────────────────────────────────────

describe("uiReducer — Brush Strokes", () => {
  it("ADD_TERRAIN_SCULPT appends stroke", () => {
    const stroke = { center: { x: 0, z: 0 }, radius: 5, strength: 0.5 };
    const result = uiReducer(makeState(), {
      type: "ADD_TERRAIN_SCULPT",
      stroke,
    } as WorldStudioAction);
    expect(result!.brushOverlays.terrainSculpts).toHaveLength(1);
  });

  it("ADD_BIOME_PAINT appends stroke", () => {
    const stroke = { center: { x: 0, z: 0 }, biome: "forest" };
    const result = uiReducer(makeState(), {
      type: "ADD_BIOME_PAINT",
      stroke,
    } as WorldStudioAction);
    expect(result!.brushOverlays.biomePaints).toHaveLength(1);
  });

  it("ADD_VEGETATION_PAINT appends stroke", () => {
    const stroke = { center: { x: 0, z: 0 }, species: "oak" };
    const result = uiReducer(makeState(), {
      type: "ADD_VEGETATION_PAINT",
      stroke,
    } as WorldStudioAction);
    expect(result!.brushOverlays.vegetationPaints).toHaveLength(1);
  });
});

// ── Tile Collision ───────────────────────────────────────

describe("uiReducer — SET_TILE_COLLISION", () => {
  it("inserts new tile collision", () => {
    const result = uiReducer(makeState(), {
      type: "SET_TILE_COLLISION",
      tiles: [{ tileX: 1, tileZ: 2, blocked: true }],
    } as WorldStudioAction);
    expect(result!.brushOverlays.tileCollisions).toHaveLength(1);
    expect(result!.brushOverlays.tileCollisions[0]).toEqual({
      tileX: 1,
      tileZ: 2,
      blocked: true,
    });
  });

  it("updates existing tile collision (upsert)", () => {
    const state = makeState({
      brushOverlays: {
        tileCollisions: [{ tileX: 1, tileZ: 2, blocked: true }],
      },
    });
    const result = uiReducer(state, {
      type: "SET_TILE_COLLISION",
      tiles: [{ tileX: 1, tileZ: 2, blocked: false }],
    } as WorldStudioAction);
    expect(result!.brushOverlays.tileCollisions).toHaveLength(1);
    expect(result!.brushOverlays.tileCollisions[0].blocked).toBe(false);
  });

  it("handles batch upsert", () => {
    const state = makeState({
      brushOverlays: {
        tileCollisions: [{ tileX: 0, tileZ: 0, blocked: true }],
      },
    });
    const result = uiReducer(state, {
      type: "SET_TILE_COLLISION",
      tiles: [
        { tileX: 0, tileZ: 0, blocked: false },
        { tileX: 1, tileZ: 1, blocked: true },
      ],
    } as WorldStudioAction);
    expect(result!.brushOverlays.tileCollisions).toHaveLength(2);
    expect(result!.brushOverlays.tileCollisions[0].blocked).toBe(false);
  });
});

// ── Undo Brush Stroke ────────────────────────────────────

describe("uiReducer — UNDO_LAST_BRUSH_STROKE", () => {
  it("removes last terrain sculpt", () => {
    const state = makeState({
      brushOverlays: {
        terrainSculpts: [
          { center: { x: 0, z: 0 }, radius: 5 },
          { center: { x: 10, z: 10 }, radius: 5 },
        ] as never[],
      },
    });
    const result = uiReducer(state, {
      type: "UNDO_LAST_BRUSH_STROKE",
      brushType: "terrain",
    } as WorldStudioAction);
    expect(result!.brushOverlays.terrainSculpts).toHaveLength(1);
  });

  it("removes last biome paint", () => {
    const state = makeState({
      brushOverlays: {
        biomePaints: [{ biome: "forest" }] as never[],
      },
    });
    const result = uiReducer(state, {
      type: "UNDO_LAST_BRUSH_STROKE",
      brushType: "biome",
    } as WorldStudioAction);
    expect(result!.brushOverlays.biomePaints).toHaveLength(0);
  });

  it("removes last vegetation paint", () => {
    const state = makeState({
      brushOverlays: {
        vegetationPaints: [{ species: "oak" }] as never[],
      },
    });
    const result = uiReducer(state, {
      type: "UNDO_LAST_BRUSH_STROKE",
      brushType: "vegetation",
    } as WorldStudioAction);
    expect(result!.brushOverlays.vegetationPaints).toHaveLength(0);
  });

  it("removes last tile collision", () => {
    const state = makeState({
      brushOverlays: {
        tileCollisions: [
          { tileX: 0, tileZ: 0, blocked: true },
          { tileX: 1, tileZ: 1, blocked: true },
        ],
      },
    });
    const result = uiReducer(state, {
      type: "UNDO_LAST_BRUSH_STROKE",
      brushType: "collision",
    } as WorldStudioAction);
    expect(result!.brushOverlays.tileCollisions).toHaveLength(1);
  });
});

// ── Clear Brush Overlays ─────────────────────────────────

describe("uiReducer — CLEAR_BRUSH_OVERLAYS", () => {
  const filledState = () =>
    makeState({
      brushOverlays: {
        terrainSculpts: [{ r: 5 }] as never[],
        biomePaints: [{ biome: "forest" }] as never[],
        vegetationPaints: [{ species: "oak" }] as never[],
        tileCollisions: [{ tileX: 0, tileZ: 0, blocked: true }],
      },
    });

  it("clears specific brush type (terrain)", () => {
    const result = uiReducer(filledState(), {
      type: "CLEAR_BRUSH_OVERLAYS",
      brushType: "terrain",
    } as WorldStudioAction);
    expect(result!.brushOverlays.terrainSculpts).toHaveLength(0);
    expect(result!.brushOverlays.biomePaints).toHaveLength(1);
  });

  it("clears specific brush type (biome)", () => {
    const result = uiReducer(filledState(), {
      type: "CLEAR_BRUSH_OVERLAYS",
      brushType: "biome",
    } as WorldStudioAction);
    expect(result!.brushOverlays.biomePaints).toHaveLength(0);
    expect(result!.brushOverlays.terrainSculpts).toHaveLength(1);
  });

  it("clears specific brush type (vegetation)", () => {
    const result = uiReducer(filledState(), {
      type: "CLEAR_BRUSH_OVERLAYS",
      brushType: "vegetation",
    } as WorldStudioAction);
    expect(result!.brushOverlays.vegetationPaints).toHaveLength(0);
  });

  it("clears specific brush type (collision)", () => {
    const result = uiReducer(filledState(), {
      type: "CLEAR_BRUSH_OVERLAYS",
      brushType: "collision",
    } as WorldStudioAction);
    expect(result!.brushOverlays.tileCollisions).toHaveLength(0);
  });

  it("clears all overlays when no brushType specified", () => {
    const result = uiReducer(filledState(), {
      type: "CLEAR_BRUSH_OVERLAYS",
    } as WorldStudioAction);
    expect(result!.brushOverlays.terrainSculpts).toHaveLength(0);
    expect(result!.brushOverlays.biomePaints).toHaveLength(0);
    expect(result!.brushOverlays.vegetationPaints).toHaveLength(0);
    expect(result!.brushOverlays.tileCollisions).toHaveLength(0);
  });
});

// ── Viewport Overlays ────────────────────────────────────

describe("uiReducer — SET_OVERLAY", () => {
  it("toggles biome overlay", () => {
    const result = uiReducer(makeState(), {
      type: "SET_OVERLAY",
      overlay: { biomeOverlay: true },
    } as WorldStudioAction);
    expect(result!.overlays.biomeOverlay).toBe(true);
  });

  it("sets time of day", () => {
    const result = uiReducer(makeState(), {
      type: "SET_OVERLAY",
      overlay: { timeOfDay: 12 },
    } as WorldStudioAction);
    expect(result!.overlays.timeOfDay).toBe(12);
  });

  it("sets weather preview", () => {
    const result = uiReducer(makeState(), {
      type: "SET_OVERLAY",
      overlay: { weatherPreview: "rain" },
    } as WorldStudioAction);
    expect(result!.overlays.weatherPreview).toBe("rain");
  });

  it("merges multiple overlay changes", () => {
    const result = uiReducer(makeState(), {
      type: "SET_OVERLAY",
      overlay: { difficultyOverlay: true, densityHeatmap: true },
    } as WorldStudioAction);
    expect(result!.overlays.difficultyOverlay).toBe(true);
    expect(result!.overlays.densityHeatmap).toBe(true);
    expect(result!.overlays.biomeOverlay).toBe(false);
  });
});

// ── Wizard Preview ───────────────────────────────────────

describe("uiReducer — Wizard Preview", () => {
  it("SET_WIZARD_PREVIEW sets preview data", () => {
    const preview = { towns: [], roads: [], zones: [] };
    const result = uiReducer(makeState(), {
      type: "SET_WIZARD_PREVIEW",
      preview,
    } as WorldStudioAction);
    expect(result!.wizardPreview).toEqual(preview);
  });

  it("CLEAR_WIZARD_PREVIEW clears preview", () => {
    const state = {
      ...makeState(),
      wizardPreview: { towns: [] },
    } as unknown as WorldStudioState;
    const result = uiReducer(state, {
      type: "CLEAR_WIZARD_PREVIEW",
    } as WorldStudioAction);
    expect(result!.wizardPreview).toBeNull();
  });
});

// ── Unhandled actions ────────────────────────────────────

describe("uiReducer — unhandled actions", () => {
  it("returns null for entity actions", () => {
    const result = uiReducer(makeState(), {
      type: "ADD_NPC",
      npc: { id: "npc-1" },
    } as WorldStudioAction);
    expect(result).toBeNull();
  });

  it("returns null for zone actions", () => {
    const result = uiReducer(makeState(), {
      type: "ADD_REGION",
      region: { id: "r-1" },
    } as WorldStudioAction);
    expect(result).toBeNull();
  });
});

// ── Immutability ─────────────────────────────────────────

describe("uiReducer — immutability", () => {
  it("does not mutate brush overlays on add", () => {
    const state = makeState();
    const original = state.brushOverlays.terrainSculpts;
    uiReducer(state, {
      type: "ADD_TERRAIN_SCULPT",
      stroke: { center: { x: 0, z: 0 }, radius: 5 },
    } as WorldStudioAction);
    expect(state.brushOverlays.terrainSculpts).toBe(original);
    expect(state.brushOverlays.terrainSculpts).toHaveLength(0);
  });

  it("does not mutate tools on SET_TOOL", () => {
    const state = makeState();
    const original = state.tools;
    uiReducer(state, {
      type: "SET_TOOL",
      tool: "brush",
    } as WorldStudioAction);
    expect(state.tools).toBe(original);
    expect(state.tools.activeTool).toBe("select");
  });
});
