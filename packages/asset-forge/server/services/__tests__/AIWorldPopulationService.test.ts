/**
 * AIWorldPopulationService — unit tests.
 *
 * Phase H test-coverage cut #7. Same recipe as AIQuestChainService:
 * vi.hoisted for AISDKService + `ai` SDK mocks.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGenerateObject, mockGetConfiguredModel } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGetConfiguredModel: vi.fn(),
}));

vi.mock("ai", () => ({
  generateObject: mockGenerateObject,
}));

vi.mock("../AISDKService", () => ({
  aiSDKService: {
    getConfiguredModel: mockGetConfiguredModel,
  },
}));

import type { GameModule } from "../../../src/gameModules/GameModule.js";
import { AIWorldPopulationService } from "../AIWorldPopulationService.js";

beforeEach(() => {
  mockGenerateObject.mockReset();
  mockGetConfiguredModel.mockReset();
  mockGetConfiguredModel.mockResolvedValue({ modelId: "test-model" });
});

/** Minimal GameModule stub with two entity types so type-filter tests can fire. */
function makeModule(): GameModule {
  // The prompt builder reads `entityType.storage.stateRoot` etc., so
  // the stub must include those fields. Field shape is flexible; the
  // real schema lives in `EntityTypeSchema` but we cast through never.
  const baseEntity = {
    storage: { stateRoot: "extendedLayers", layer: "default" },
    spatial: false,
    fields: [] as never,
  };
  return {
    id: "test",
    name: "Test",
    version: "0.0.1",
    entityTypes: [
      {
        id: "tree",
        name: "Tree",
        category: "nature",
        ...baseEntity,
      } as never,
      {
        id: "house",
        name: "House",
        category: "structure",
        ...baseEntity,
      } as never,
    ],
    paletteCategories: [],
    outlinerLayers: [],
  };
}

/** Minimal TerrainSummary stub matching the prompt builder's shape. */
function makeTerrain() {
  return {
    worldSize: { width: 100, height: 100 },
    tileSize: 1,
    totalArea: 10_000,
    avgElevation: 0,
    elevationRange: { min: 0, max: 10 },
    biomes: { plains: 1.0 },
  };
}

function fakePlacementResponse(placements: unknown[], reasoning = "ok") {
  return {
    object: { placements, reasoning },
  };
}

describe("AIWorldPopulationService — populateWorld request shape", () => {
  it("Forwards quality tier to aiSDKService.getConfiguredModel", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakePlacementResponse([]));
    const svc = new AIWorldPopulationService();

    await svc.populateWorld({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: makeModule() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terrainSummary: makeTerrain(),
      instruction: "build a town",
      mode: "suggest",
      quality: "speed",
    });

    expect(mockGetConfiguredModel).toHaveBeenCalledWith("speed");
  });

  it("Defaults to 'balanced' tier when caller does not specify", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakePlacementResponse([]));
    const svc = new AIWorldPopulationService();

    await svc.populateWorld({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: makeModule() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terrainSummary: makeTerrain(),
      instruction: "x",
      mode: "auto",
    });

    expect(mockGetConfiguredModel).toHaveBeenCalledWith("balanced");
  });

  it("Calls generateObject with model + schema + temperature 0.7", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakePlacementResponse([]));
    const svc = new AIWorldPopulationService();

    await svc.populateWorld({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: makeModule() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terrainSummary: makeTerrain(),
      instruction: "x",
      mode: "suggest",
    });

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const args = mockGenerateObject.mock.calls[0][0];
    expect(args.model).toEqual({ modelId: "test-model" });
    expect(args.temperature).toBe(0.7);
    expect(args.schema).toBeDefined();
  });
});

describe("AIWorldPopulationService — prompt assembly", () => {
  it("Suggest-mode user prompt includes the instruction verbatim", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakePlacementResponse([]));
    const svc = new AIWorldPopulationService();

    await svc.populateWorld({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: makeModule() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terrainSummary: makeTerrain(),
      instruction: "place a village near the river",
      mode: "suggest",
    });

    const prompt = mockGenerateObject.mock.calls[0][0].prompt;
    expect(prompt).toContain("place a village near the river");
    expect(prompt).toMatch(/Instruction/);
  });

  it("Auto-mode user prompt includes the auto-populate header", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakePlacementResponse([]));
    const svc = new AIWorldPopulationService();

    await svc.populateWorld({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: makeModule() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terrainSummary: makeTerrain(),
      instruction: "x",
      mode: "auto",
    });

    const prompt = mockGenerateObject.mock.calls[0][0].prompt;
    expect(prompt).toMatch(/Auto-Populate Mode/);
  });

  it("Includes the maxPlacements directive (default 50)", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakePlacementResponse([]));
    const svc = new AIWorldPopulationService();

    await svc.populateWorld({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: makeModule() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terrainSummary: makeTerrain(),
      instruction: "x",
      mode: "auto",
    });

    expect(mockGenerateObject.mock.calls[0][0].prompt).toMatch(
      /up to 50 entity placements/,
    );
  });

  it("Honors caller-supplied maxPlacements", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakePlacementResponse([]));
    const svc = new AIWorldPopulationService();

    await svc.populateWorld({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: makeModule() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terrainSummary: makeTerrain(),
      instruction: "x",
      mode: "auto",
      maxPlacements: 10,
    });

    expect(mockGenerateObject.mock.calls[0][0].prompt).toMatch(
      /up to 10 entity placements/,
    );
  });

  it("System prompt embeds module schema context", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakePlacementResponse([]));
    const svc = new AIWorldPopulationService();

    await svc.populateWorld({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: makeModule() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terrainSummary: makeTerrain(),
      instruction: "x",
      mode: "auto",
    });

    // The prompt context builder labels its sections; just check that
    // *something* was injected without depending on the exact format.
    expect(mockGenerateObject.mock.calls[0][0].system.length).toBeGreaterThan(
      100,
    );
  });
});

describe("AIWorldPopulationService — output handling", () => {
  it("Filters out placements whose entityTypeId is not in module schema", async () => {
    const placements = [
      {
        entityTypeId: "tree",
        name: "Oak",
        position: { x: 1, y: 0, z: 1 },
        rotation: 0,
        data: {},
        reasoning: "",
      },
      {
        entityTypeId: "ghost", // not in module
        name: "Phantom",
        position: { x: 2, y: 0, z: 2 },
        rotation: 0,
        data: {},
        reasoning: "",
      },
      {
        entityTypeId: "house",
        name: "Cottage",
        position: { x: 3, y: 0, z: 3 },
        rotation: 0,
        data: {},
        reasoning: "",
      },
    ];
    mockGenerateObject.mockResolvedValueOnce(
      fakePlacementResponse(placements, "test reasoning"),
    );
    const svc = new AIWorldPopulationService();

    const result = await svc.populateWorld({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: makeModule() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terrainSummary: makeTerrain(),
      instruction: "x",
      mode: "auto",
    });

    expect(result.placements).toHaveLength(2);
    expect(result.placements.map((p) => p.entityTypeId)).toEqual([
      "tree",
      "house",
    ]);
    expect(result.reasoning).toBe("test reasoning");
  });

  it("Clamps placements to maxPlacements after type-filtering", async () => {
    const placements = Array.from({ length: 100 }, (_, i) => ({
      entityTypeId: "tree",
      name: `Tree-${i}`,
      position: { x: i, y: 0, z: i },
      rotation: 0,
      data: {},
      reasoning: "",
    }));
    mockGenerateObject.mockResolvedValueOnce(fakePlacementResponse(placements));
    const svc = new AIWorldPopulationService();

    const result = await svc.populateWorld({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: makeModule() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terrainSummary: makeTerrain(),
      instruction: "x",
      mode: "auto",
      maxPlacements: 5,
    });

    expect(result.placements).toHaveLength(5);
  });

  it("Returns empty placements when the model returns nothing", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakePlacementResponse([]));
    const svc = new AIWorldPopulationService();

    const result = await svc.populateWorld({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: makeModule() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      terrainSummary: makeTerrain(),
      instruction: "x",
      mode: "auto",
    });

    expect(result.placements).toEqual([]);
  });
});

describe("AIWorldPopulationService — error propagation", () => {
  it("Propagates errors from getConfiguredModel", async () => {
    mockGetConfiguredModel.mockRejectedValueOnce(new Error("no key"));
    const svc = new AIWorldPopulationService();

    await expect(
      svc.populateWorld({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        module: makeModule() as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        terrainSummary: makeTerrain(),
        instruction: "x",
        mode: "auto",
      }),
    ).rejects.toThrow(/no key/);
  });

  it("Propagates errors from generateObject", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("model error"));
    const svc = new AIWorldPopulationService();

    await expect(
      svc.populateWorld({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        module: makeModule() as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        terrainSummary: makeTerrain(),
        instruction: "x",
        mode: "auto",
      }),
    ).rejects.toThrow(/model error/);
  });
});
