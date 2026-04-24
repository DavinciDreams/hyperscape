/**
 * Tests for the DialogueConditionBindingsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dialogueConditionBindingsProvider } from "../DialogueConditionBindingsProvider";

// Reset singleton state before AND after every test so cross-file leak
// (another suite loading the provider earlier in the vitest run) can't
// pollute the "starts unloaded" assertions.
beforeEach(() => {
  dialogueConditionBindingsProvider.unload();
});
afterEach(() => {
  dialogueConditionBindingsProvider.unload();
});

const validManifest = {
  $schema: "hyperforge.dialogue-condition-bindings.v1" as const,
  bindings: [
    {
      kind: "quest-active" as const,
      name: "has_bandits_quest",
      questId: "bandits",
    },
    { kind: "has-item" as const, name: "has_key", itemId: "iron_key" },
  ],
};

describe("DialogueConditionBindingsProvider", () => {
  it("starts unloaded with an empty bindings list", () => {
    expect(dialogueConditionBindingsProvider.isLoaded()).toBe(false);
    expect(dialogueConditionBindingsProvider.getBindings()).toEqual([]);
    expect(dialogueConditionBindingsProvider.getManifest()).toBeNull();
  });

  it("load() installs a validated manifest and returns the parsed shape", () => {
    dialogueConditionBindingsProvider.load(validManifest);
    expect(dialogueConditionBindingsProvider.isLoaded()).toBe(true);
    expect(dialogueConditionBindingsProvider.getBindings().length).toBe(2);
  });

  it("loadRaw() validates raw JSON and rejects invalid manifests", () => {
    expect(() =>
      dialogueConditionBindingsProvider.loadRaw({
        $schema: "hyperforge.dialogue-condition-bindings.v1",
        bindings: [{ kind: "unknown", name: "bad" }],
      }),
    ).toThrow();
    // Invalid parse must not leave the provider in a half-loaded state.
    expect(dialogueConditionBindingsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts and installs a valid raw payload", () => {
    const parsed = dialogueConditionBindingsProvider.loadRaw(validManifest);
    expect(parsed).toEqual(validManifest);
    expect(dialogueConditionBindingsProvider.isLoaded()).toBe(true);
    expect(dialogueConditionBindingsProvider.getBindings()).toEqual(
      validManifest.bindings,
    );
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    dialogueConditionBindingsProvider.load(validManifest);
    dialogueConditionBindingsProvider.hotReload({
      $schema: "hyperforge.dialogue-condition-bindings.v1",
      bindings: [{ kind: "has-item", name: "has_gold", itemId: "gold_key" }],
    });
    expect(dialogueConditionBindingsProvider.getBindings()).toEqual([
      { kind: "has-item", name: "has_gold", itemId: "gold_key" },
    ]);
  });

  it("hotReload(null) clears the authored list", () => {
    dialogueConditionBindingsProvider.load(validManifest);
    dialogueConditionBindingsProvider.hotReload(null);
    expect(dialogueConditionBindingsProvider.isLoaded()).toBe(false);
    expect(dialogueConditionBindingsProvider.getBindings()).toEqual([]);
  });

  it("unload() resets to the default empty state", () => {
    dialogueConditionBindingsProvider.load(validManifest);
    dialogueConditionBindingsProvider.unload();
    expect(dialogueConditionBindingsProvider.isLoaded()).toBe(false);
    expect(dialogueConditionBindingsProvider.getBindings()).toEqual([]);
    expect(dialogueConditionBindingsProvider.getManifest()).toBeNull();
  });

  it("getBindings() returns an empty array (not null) when unloaded — safe to iterate", () => {
    const bindings = dialogueConditionBindingsProvider.getBindings();
    expect(Array.isArray(bindings)).toBe(true);
    expect(bindings.length).toBe(0);
  });
});
