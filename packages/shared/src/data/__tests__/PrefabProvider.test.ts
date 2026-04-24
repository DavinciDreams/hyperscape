/**
 * Tests for the PrefabProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prefabProvider } from "../PrefabProvider";

beforeEach(() => {
  prefabProvider.unload();
});
afterEach(() => {
  prefabProvider.unload();
});

describe("PrefabProvider", () => {
  it("starts unloaded", () => {
    expect(prefabProvider.isLoaded()).toBe(false);
    expect(prefabProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts {} baseline", () => {
    const parsed = prefabProvider.loadRaw({});
    expect(parsed.prefabs).toEqual([]);
    expect(parsed.instances).toEqual([]);
    expect(prefabProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects instance with no matching prefab", () => {
    expect(() =>
      prefabProvider.loadRaw({
        prefabs: [],
        instances: [
          {
            id: "instA",
            prefabId: "nonexistent",
            transform: { position: { x: 0, y: 0, z: 0 } },
          },
        ],
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = prefabProvider.loadRaw({});
    prefabProvider.unload();
    prefabProvider.load(parsed);
    expect(prefabProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    prefabProvider.loadRaw({});
    prefabProvider.hotReload(null);
    expect(prefabProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    prefabProvider.loadRaw({});
    prefabProvider.unload();
    expect(prefabProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(prefabProvider).toBe(prefabProvider);
  });
});
