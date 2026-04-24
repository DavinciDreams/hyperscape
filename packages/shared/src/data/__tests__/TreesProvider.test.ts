/**
 * Tests for the TreesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { treesProvider } from "../TreesProvider";

beforeEach(() => {
  treesProvider.unload();
});
afterEach(() => {
  treesProvider.unload();
});

const baseline = {
  $schema: "hyperforge.trees.v1" as const,
  trees: {},
};

describe("TreesProvider", () => {
  it("starts unloaded", () => {
    expect(treesProvider.isLoaded()).toBe(false);
    expect(treesProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — $schema/trees required", () => {
    expect(() => treesProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts empty-trees baseline", () => {
    const parsed = treesProvider.loadRaw(baseline);
    expect(parsed.$schema).toBe("hyperforge.trees.v1");
    expect(parsed.trees).toEqual({});
  });

  it("loadRaw() accepts valid tree entries keyed by subtype", () => {
    const parsed = treesProvider.loadRaw({
      ...baseline,
      trees: {
        oak: { id: "tree_oak", name: "Oak Tree", levelRequired: 15 },
      },
    });
    expect(parsed.trees.oak!.id).toBe("tree_oak");
  });

  it("loadRaw() rejects non-positive levelRequired", () => {
    const bad = {
      ...baseline,
      trees: { oak: { id: "tree_oak", name: "Oak", levelRequired: 0 } },
    };
    expect(() => treesProvider.loadRaw(bad)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = treesProvider.loadRaw(baseline);
    treesProvider.unload();
    treesProvider.load(parsed);
    expect(treesProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    treesProvider.loadRaw(baseline);
    treesProvider.hotReload(null);
    expect(treesProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    treesProvider.loadRaw(baseline);
    treesProvider.unload();
    expect(treesProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(treesProvider).toBe(treesProvider);
  });
});
