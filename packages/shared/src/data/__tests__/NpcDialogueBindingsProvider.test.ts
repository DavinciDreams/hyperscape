/**
 * Tests for the NpcDialogueBindingsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { npcDialogueBindingsProvider } from "../NpcDialogueBindingsProvider";

beforeEach(() => {
  npcDialogueBindingsProvider.unload();
});
afterEach(() => {
  npcDialogueBindingsProvider.unload();
});

const validBindings = {
  guard: "guard-default",
  merchant: "merchant-intro",
};

describe("NpcDialogueBindingsProvider", () => {
  it("starts unloaded with an empty binding record", () => {
    expect(npcDialogueBindingsProvider.isLoaded()).toBe(false);
    expect(npcDialogueBindingsProvider.getBindings()).toEqual({});
    expect(npcDialogueBindingsProvider.getManifest()).toBeNull();
  });

  it("load() installs an already-validated mapping", () => {
    npcDialogueBindingsProvider.load(validBindings);
    expect(npcDialogueBindingsProvider.isLoaded()).toBe(true);
    expect(npcDialogueBindingsProvider.getBindings()).toEqual(validBindings);
  });

  it("loadRaw() rejects invalid payloads", () => {
    expect(() => npcDialogueBindingsProvider.loadRaw({ guard: "" })).toThrow();
    expect(npcDialogueBindingsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts valid payload and returns parsed record", () => {
    const parsed = npcDialogueBindingsProvider.loadRaw(validBindings);
    expect(parsed).toEqual(validBindings);
    expect(npcDialogueBindingsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(bindings) replaces the current bindings", () => {
    npcDialogueBindingsProvider.load(validBindings);
    const replacement = { king: "throne-room" };
    npcDialogueBindingsProvider.hotReload(replacement);
    expect(npcDialogueBindingsProvider.getBindings()).toEqual(replacement);
  });

  it("hotReload(null) clears", () => {
    npcDialogueBindingsProvider.load(validBindings);
    npcDialogueBindingsProvider.hotReload(null);
    expect(npcDialogueBindingsProvider.isLoaded()).toBe(false);
    expect(npcDialogueBindingsProvider.getBindings()).toEqual({});
  });

  it("unload() resets to default empty state", () => {
    npcDialogueBindingsProvider.load(validBindings);
    npcDialogueBindingsProvider.unload();
    expect(npcDialogueBindingsProvider.isLoaded()).toBe(false);
    expect(npcDialogueBindingsProvider.getManifest()).toBeNull();
  });

  it("getBindings() returns {} (not null) when unloaded — safe to iterate", () => {
    const bindings = npcDialogueBindingsProvider.getBindings();
    expect(typeof bindings).toBe("object");
    expect(Object.keys(bindings).length).toBe(0);
  });
});
