/**
 * Tests for the GroupFinderProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { groupFinderProvider } from "../GroupFinderProvider";

beforeEach(() => {
  groupFinderProvider.unload();
});
afterEach(() => {
  groupFinderProvider.unload();
});

const validContent = {
  id: "riftDungeon",
  name: "Rift Dungeon",
  kind: "dungeon" as const,
  minGroupSize: 3,
  maxGroupSize: 5,
  queuePolicy: "random" as const,
  minLevel: 1,
};

const validManifest = {
  enabled: true,
  content: [validContent],
};

describe("GroupFinderProvider", () => {
  it("starts unloaded", () => {
    expect(groupFinderProvider.isLoaded()).toBe(false);
    expect(groupFinderProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts valid manifest", () => {
    const parsed = groupFinderProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.content.length).toBe(1);
    expect(groupFinderProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob", () => {
    const parsed = groupFinderProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.content.length).toBe(0);
  });

  it("loadRaw() rejects enabled=true without content", () => {
    expect(() => groupFinderProvider.loadRaw({ enabled: true })).toThrow();
  });

  it("loadRaw() rejects duplicate content ids", () => {
    expect(() =>
      groupFinderProvider.loadRaw({
        ...validManifest,
        content: [validContent, { ...validContent }],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects min>max group size", () => {
    expect(() =>
      groupFinderProvider.loadRaw({
        ...validManifest,
        content: [{ ...validContent, minGroupSize: 10, maxGroupSize: 5 }],
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = groupFinderProvider.loadRaw(validManifest);
    groupFinderProvider.unload();
    groupFinderProvider.load(parsed);
    expect(groupFinderProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    groupFinderProvider.loadRaw(validManifest);
    const parsed = groupFinderProvider.loadRaw({ enabled: false });
    groupFinderProvider.hotReload(parsed);
    expect(groupFinderProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    groupFinderProvider.loadRaw(validManifest);
    groupFinderProvider.hotReload(null);
    expect(groupFinderProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    groupFinderProvider.loadRaw(validManifest);
    groupFinderProvider.unload();
    expect(groupFinderProvider.isLoaded()).toBe(false);
  });
});
