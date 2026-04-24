/**
 * Tests for the ToolsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { toolsProvider } from "../ToolsProvider";

beforeEach(() => {
  toolsProvider.unload();
});
afterEach(() => {
  toolsProvider.unload();
});

const validEntry = {
  itemId: "bronze_hatchet",
  skill: "woodcutting" as const,
  tier: "bronze",
  levelRequired: 1,
  priority: 0,
};

describe("ToolsProvider", () => {
  it("starts unloaded", () => {
    expect(toolsProvider.isLoaded()).toBe(false);
    expect(toolsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = toolsProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(toolsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects non-array input", () => {
    expect(() => toolsProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts valid entries", () => {
    const parsed = toolsProvider.loadRaw([validEntry]);
    expect(parsed[0]!.itemId).toBe("bronze_hatchet");
    expect(parsed[0]!.skill).toBe("woodcutting");
  });

  it("loadRaw() rejects unknown skill enum", () => {
    const bad = [{ ...validEntry, skill: "alchemy" }];
    expect(() => toolsProvider.loadRaw(bad)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = toolsProvider.loadRaw([validEntry]);
    toolsProvider.unload();
    toolsProvider.load(parsed);
    expect(toolsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    toolsProvider.loadRaw([validEntry]);
    toolsProvider.hotReload(null);
    expect(toolsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    toolsProvider.loadRaw([validEntry]);
    toolsProvider.unload();
    expect(toolsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(toolsProvider).toBe(toolsProvider);
  });
});
