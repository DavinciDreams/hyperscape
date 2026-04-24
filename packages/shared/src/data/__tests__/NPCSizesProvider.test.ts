/**
 * Tests for the NPCSizesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { npcSizesProvider } from "../NPCSizesProvider";

beforeEach(() => {
  npcSizesProvider.unload();
});
afterEach(() => {
  npcSizesProvider.unload();
});

const baseline = {
  $schema: "hyperforge.npc-sizes.v1" as const,
  sizes: {},
};

describe("NPCSizesProvider", () => {
  it("starts unloaded", () => {
    expect(npcSizesProvider.isLoaded()).toBe(false);
    expect(npcSizesProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — $schema/sizes required", () => {
    expect(() => npcSizesProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts empty sizes baseline", () => {
    const parsed = npcSizesProvider.loadRaw(baseline);
    expect(parsed.$schema).toBe("hyperforge.npc-sizes.v1");
    expect(parsed.sizes).toEqual({});
  });

  it("loadRaw() accepts valid NPC size entries", () => {
    const parsed = npcSizesProvider.loadRaw({
      ...baseline,
      sizes: { goblin: { width: 1, depth: 1 }, dragon: { width: 3, depth: 3 } },
    });
    expect(parsed.sizes.dragon!.width).toBe(3);
  });

  it("loadRaw() rejects non-positive width", () => {
    const bad = {
      ...baseline,
      sizes: { goblin: { width: 0, depth: 1 } },
    };
    expect(() => npcSizesProvider.loadRaw(bad)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = npcSizesProvider.loadRaw(baseline);
    npcSizesProvider.unload();
    npcSizesProvider.load(parsed);
    expect(npcSizesProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    npcSizesProvider.loadRaw(baseline);
    npcSizesProvider.hotReload(null);
    expect(npcSizesProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    npcSizesProvider.loadRaw(baseline);
    npcSizesProvider.unload();
    expect(npcSizesProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(npcSizesProvider).toBe(npcSizesProvider);
  });
});
