import { ArenaLayoutManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  ArenaIndexOutOfRangeError,
  ArenaLayoutNotLoadedError,
  ArenaLayoutRegistry,
} from "../ArenaLayoutRegistry.js";

function manifest() {
  return ArenaLayoutManifestSchema.parse({
    $schema: "hyperforge.arena-layout.v1",
    arenaGrid: {
      baseX: 0,
      baseZ: 0,
      baseY: 0,
      width: 10,
      length: 10,
      gap: 2,
      columns: 2,
      rows: 2,
      count: 4,
      spawnOffset: 2,
    },
    lobby: { centerX: 0, centerZ: -20, width: 10, length: 8 },
    hospital: { centerX: 0, centerZ: 40, width: 8, length: 6 },
    lobbySpawn: { x: 0, y: 0, z: -20 },
  });
}

describe("ArenaLayoutRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new ArenaLayoutRegistry().manifest).toThrow(
      ArenaLayoutNotLoadedError,
    );
  });
});

describe("ArenaLayoutRegistry — arenas", () => {
  it("computes center for index 0", () => {
    const r = new ArenaLayoutRegistry(manifest());
    expect(r.arenaCenter(0)).toEqual({ x: 5, y: 0, z: 5 });
  });

  it("computes center for index 3 (col=1,row=1)", () => {
    const r = new ArenaLayoutRegistry(manifest());
    // col=1 → x = 0 + 1*(10+2) + 5 = 17; row=1 → z = 0 + 1*(10+2) + 5 = 17
    expect(r.arenaCenter(3)).toEqual({ x: 17, y: 0, z: 17 });
  });

  it("bounds wrap center by width/length/2", () => {
    const r = new ArenaLayoutRegistry(manifest());
    expect(r.arenaBounds(0)).toEqual({ minX: 0, maxX: 10, minZ: 0, maxZ: 10 });
  });

  it("throws on out-of-range index", () => {
    const r = new ArenaLayoutRegistry(manifest());
    expect(() => r.arenaCenter(4)).toThrow(ArenaIndexOutOfRangeError);
    expect(() => r.arenaCenter(-1)).toThrow(ArenaIndexOutOfRangeError);
  });
});

describe("ArenaLayoutRegistry — buildings", () => {
  it("lobby + hospital bounds", () => {
    const r = new ArenaLayoutRegistry(manifest());
    expect(r.lobbyBounds()).toEqual({
      minX: -5,
      maxX: 5,
      minZ: -24,
      maxZ: -16,
    });
    expect(r.hospitalBounds()).toEqual({
      minX: -4,
      maxX: 4,
      minZ: 37,
      maxZ: 43,
    });
  });

  it("lobby spawn point", () => {
    const r = new ArenaLayoutRegistry(manifest());
    expect(r.lobbySpawn).toEqual({ x: 0, y: 0, z: -20 });
  });

  it("arenaCount matches manifest", () => {
    const r = new ArenaLayoutRegistry(manifest());
    expect(r.arenaCount).toBe(4);
  });
});

describe("ArenaLayoutRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new ArenaLayoutRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new ArenaLayoutRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new ArenaLayoutRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
