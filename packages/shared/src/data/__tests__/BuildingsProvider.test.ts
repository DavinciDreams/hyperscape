/**
 * Tests for the BuildingsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildingsProvider } from "../BuildingsProvider";

beforeEach(() => {
  buildingsProvider.unload();
});
afterEach(() => {
  buildingsProvider.unload();
});

describe("BuildingsProvider", () => {
  it("starts unloaded", () => {
    expect(buildingsProvider.isLoaded()).toBe(false);
    expect(buildingsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = buildingsProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(buildingsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects non-array input", () => {
    expect(() => buildingsProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts entries with id + passthrough metadata", () => {
    const parsed = buildingsProvider.loadRaw([
      { id: "houseA", position: { x: 0, y: 0, z: 0 }, rotation: 1.57 },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.id).toBe("houseA");
    // passthrough preserves extra keys
    expect((parsed[0] as { position?: unknown }).position).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
  });

  it("loadRaw() rejects entries without id", () => {
    expect(() =>
      buildingsProvider.loadRaw([{ position: { x: 0, y: 0, z: 0 } }]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = buildingsProvider.loadRaw([{ id: "x" }]);
    buildingsProvider.unload();
    buildingsProvider.load(parsed);
    expect(buildingsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    buildingsProvider.loadRaw([{ id: "x" }]);
    buildingsProvider.hotReload(null);
    expect(buildingsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    buildingsProvider.loadRaw([{ id: "x" }]);
    buildingsProvider.unload();
    expect(buildingsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(buildingsProvider).toBe(buildingsProvider);
  });
});
