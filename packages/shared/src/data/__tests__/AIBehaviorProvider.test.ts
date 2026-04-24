/**
 * Tests for the AIBehaviorProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { aiBehaviorProvider } from "../AIBehaviorProvider";

beforeEach(() => {
  aiBehaviorProvider.unload();
});
afterEach(() => {
  aiBehaviorProvider.unload();
});

const validTree = {
  id: "wanderAgent",
  name: "Wander Agent",
  root: "rootNode",
  nodes: {
    rootNode: {
      id: "rootNode",
      kind: "action",
      action: "executeIdle",
    },
  },
};

describe("AIBehaviorProvider", () => {
  it("starts unloaded", () => {
    expect(aiBehaviorProvider.isLoaded()).toBe(false);
    expect(aiBehaviorProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = aiBehaviorProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(aiBehaviorProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid single-node tree", () => {
    const parsed = aiBehaviorProvider.loadRaw([validTree]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("wanderAgent");
  });

  it("loadRaw() rejects duplicate tree ids", () => {
    expect(() =>
      aiBehaviorProvider.loadRaw([validTree, { ...validTree }]),
    ).toThrow();
  });

  it("loadRaw() rejects tree whose root points at a missing node", () => {
    expect(() =>
      aiBehaviorProvider.loadRaw([{ ...validTree, root: "ghost" }]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = aiBehaviorProvider.loadRaw([validTree]);
    aiBehaviorProvider.unload();
    aiBehaviorProvider.load(parsed);
    expect(aiBehaviorProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    aiBehaviorProvider.loadRaw([validTree]);
    aiBehaviorProvider.hotReload(null);
    expect(aiBehaviorProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    aiBehaviorProvider.loadRaw([validTree]);
    aiBehaviorProvider.unload();
    expect(aiBehaviorProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(aiBehaviorProvider).toBe(aiBehaviorProvider);
  });
});
