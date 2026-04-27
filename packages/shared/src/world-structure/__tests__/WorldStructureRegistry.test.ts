import { WorldStructureManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  WorldStructureNotLoadedError,
  WorldStructureRegistry,
} from "../WorldStructureRegistry.js";

function manifest() {
  return WorldStructureManifestSchema.parse({
    $schema: "hyperforge.world-structure.v1",
    constants: {
      gridSize: 1,
      defaultSpawnHeight: 2,
      waterLevel: 0,
      maxBuildHeight: 256,
      safeZoneRadius: 30,
    },
  });
}

describe("WorldStructureRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new WorldStructureRegistry().constants).toThrow(
      WorldStructureNotLoadedError,
    );
  });

  it("surfaces constants via getters", () => {
    const r = new WorldStructureRegistry(manifest());
    expect(r.gridSize).toBe(1);
    expect(r.defaultSpawnHeight).toBe(2);
    expect(r.waterLevel).toBe(0);
    expect(r.maxBuildHeight).toBe(256);
    expect(r.safeZoneRadius).toBe(30);
  });

  it("isUnderwater uses water level", () => {
    const r = new WorldStructureRegistry(manifest());
    expect(r.isUnderwater(-1)).toBe(true);
    expect(r.isUnderwater(0)).toBe(false);
    expect(r.isUnderwater(5)).toBe(false);
  });

  it("isInSafeZone uses Euclidean distance", () => {
    const r = new WorldStructureRegistry(manifest());
    const center = { x: 0, z: 0 };
    expect(r.isInSafeZone(0, 0, center)).toBe(true);
    expect(r.isInSafeZone(30, 0, center)).toBe(true);
    expect(r.isInSafeZone(31, 0, center)).toBe(false);
    // sqrt(25²+25²) = sqrt(1250) ≈ 35.35 > 30
    expect(r.isInSafeZone(25, 25, center)).toBe(false);
  });

  it("loadFromJson validates", () => {
    const r = new WorldStructureRegistry();
    r.loadFromJson(manifest());
    expect(r.gridSize).toBe(1);
  });
});

describe("WorldStructureRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new WorldStructureRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.loadFromJson(manifest());
    r.loadFromJson(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new WorldStructureRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.loadFromJson(manifest());
    off();
    r.loadFromJson(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new WorldStructureRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.loadFromJson(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
