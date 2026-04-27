import {
  ModelBoundsManifestSchema,
  StationsManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  StationsNotLoadedError,
  StationsRegistry,
  UnknownStationError,
} from "../StationsRegistry.js";

function stationsManifest() {
  return StationsManifestSchema.parse({
    stations: [
      {
        type: "anvil",
        name: "Anvil",
        model: "asset://anvil.glb",
        modelScale: 1,
        modelYOffset: 0,
        examine: "An anvil.",
      },
      {
        type: "furnace",
        name: "Furnace",
        model: "asset://furnace.glb",
        modelScale: 2,
        modelYOffset: 0,
        examine: "A furnace.",
      },
      {
        type: "bank",
        name: "Bank",
        model: null,
        modelScale: 1,
        modelYOffset: 0,
        examine: "A bank counter.",
        footprint: { width: 3, depth: 2 },
      },
    ],
  });
}

function boundsManifest() {
  return ModelBoundsManifestSchema.parse({
    generatedAt: "2025-01-01",
    tileSize: 1,
    models: [
      {
        id: "anvil",
        assetPath: "asset://anvil.glb",
        bounds: {
          min: { x: -0.5, y: 0, z: -0.4 },
          max: { x: 0.5, y: 1, z: 0.4 },
        },
        dimensions: { x: 1, y: 1, z: 0.8 },
        footprint: { width: 1, depth: 1 },
      },
      {
        id: "furnace",
        assetPath: "asset://furnace.glb",
        bounds: {
          min: { x: -1, y: 0, z: -1 },
          max: { x: 1, y: 2, z: 1 },
        },
        dimensions: { x: 2, y: 2, z: 2 },
        footprint: { width: 2, depth: 2 },
      },
    ],
  });
}

describe("StationsRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new StationsRegistry().stationsManifest).toThrow(
      StationsNotLoadedError,
    );
  });

  it("indexes stations by type", () => {
    const r = new StationsRegistry(stationsManifest());
    expect(r.get("anvil").name).toBe("Anvil");
    expect(r.has("furnace")).toBe(true);
    expect(() => r.get("ghost")).toThrow(UnknownStationError);
  });

  it("uses authored footprint override when present", () => {
    const r = new StationsRegistry(stationsManifest(), boundsManifest());
    expect(r.footprintFor("bank")).toEqual({ width: 3, depth: 2 });
  });

  it("falls back to model-bounds footprint scaled by modelScale", () => {
    const r = new StationsRegistry(stationsManifest(), boundsManifest());
    expect(r.footprintFor("anvil")).toEqual({ width: 1, depth: 1 });
    expect(r.footprintFor("furnace")).toEqual({ width: 4, depth: 4 }); // 2x2 * scale 2
  });

  it("returns undefined when no footprint and no bounds", () => {
    const r = new StationsRegistry(
      StationsManifestSchema.parse({
        stations: [
          {
            type: "mystery",
            name: "M",
            model: null,
            modelScale: 1,
            modelYOffset: 0,
            examine: "?",
          },
        ],
      }),
    );
    expect(r.footprintFor("mystery")).toBeUndefined();
  });

  it("boundsFor returns model bounds entry", () => {
    const r = new StationsRegistry(stationsManifest(), boundsManifest());
    expect(r.boundsFor("anvil")?.assetPath).toBe("asset://anvil.glb");
    expect(r.boundsFor("ghost")).toBeUndefined();
  });

  it("onReloaded fires after loadStations() and supports unsubscribe", () => {
    const r = new StationsRegistry();
    let count = 0;
    const off = r.onReloaded(() => {
      count++;
    });
    r.loadStations(stationsManifest());
    r.loadStations(stationsManifest());
    expect(count).toBe(2);
    off();
    r.loadStations(stationsManifest());
    expect(count).toBe(2);
  });

  it("onReloaded fires after loadBounds() too — both feeds notify", () => {
    const r = new StationsRegistry();
    let count = 0;
    r.onReloaded(() => {
      count++;
    });
    r.loadStations(stationsManifest());
    r.loadBounds(boundsManifest());
    expect(count).toBe(2);
  });

  it("onReloaded fires after loadFromJson variants", () => {
    const r = new StationsRegistry();
    let count = 0;
    r.onReloaded(() => {
      count++;
    });
    r.loadStationsFromJson(stationsManifest());
    r.loadBoundsFromJson(boundsManifest());
    expect(count).toBe(2);
  });

  it("onReloaded survives a throwing listener (logs but does not propagate)", () => {
    const r = new StationsRegistry();
    const goodListener = vi.fn();
    r.onReloaded(() => {
      throw new Error("intentional");
    });
    r.onReloaded(goodListener);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => r.loadStations(stationsManifest())).not.toThrow();
    expect(goodListener).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
