/**
 * Tests for the DialogueProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dialogueProvider } from "../DialogueProvider";

beforeEach(() => {
  dialogueProvider.unload();
});
afterEach(() => {
  dialogueProvider.unload();
});

const validManifest = [
  {
    id: "greeting",
    name: "Greeting",
    description: "Hello",
    start: "n0",
    nodes: {
      n0: {
        kind: "line" as const,
        id: "n0",
        speaker: "narrator",
        textKey: "greeting.hello",
        next: "n1",
      },
      n1: {
        kind: "end" as const,
        id: "n1",
      },
    },
  },
];

describe("DialogueProvider", () => {
  it("starts unloaded with an empty trees list", () => {
    expect(dialogueProvider.isLoaded()).toBe(false);
    expect(dialogueProvider.getTrees()).toEqual([]);
    expect(dialogueProvider.getManifest()).toBeNull();
  });

  it("load() installs a validated manifest", () => {
    dialogueProvider.load(validManifest);
    expect(dialogueProvider.isLoaded()).toBe(true);
    expect(dialogueProvider.getTrees().length).toBe(1);
  });

  it("loadRaw() rejects duplicate tree ids", () => {
    expect(() =>
      dialogueProvider.loadRaw([validManifest[0], { ...validManifest[0] }]),
    ).toThrow();
    expect(dialogueProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts and installs a valid raw payload", () => {
    const parsed = dialogueProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(1);
    expect(parsed[0]?.id).toBe("greeting");
    expect(dialogueProvider.isLoaded()).toBe(true);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    dialogueProvider.load(validManifest);
    const second = [{ ...validManifest[0], id: "farewell" }];
    dialogueProvider.hotReload(second);
    expect(dialogueProvider.getTrees()[0]?.id).toBe("farewell");
  });

  it("hotReload(null) clears the authored list", () => {
    dialogueProvider.load(validManifest);
    dialogueProvider.hotReload(null);
    expect(dialogueProvider.isLoaded()).toBe(false);
    expect(dialogueProvider.getTrees()).toEqual([]);
  });

  it("unload() resets to the default empty state", () => {
    dialogueProvider.load(validManifest);
    dialogueProvider.unload();
    expect(dialogueProvider.isLoaded()).toBe(false);
    expect(dialogueProvider.getManifest()).toBeNull();
  });

  it("getTrees() returns an empty array (not null) when unloaded — safe to iterate", () => {
    const trees = dialogueProvider.getTrees();
    expect(Array.isArray(trees)).toBe(true);
    expect(trees.length).toBe(0);
  });
});
