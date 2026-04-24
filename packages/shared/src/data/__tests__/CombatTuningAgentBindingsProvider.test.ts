/**
 * Tests for the CombatTuningAgentBindingsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { combatTuningAgentBindingsProvider } from "../CombatTuningAgentBindingsProvider";

beforeEach(() => {
  combatTuningAgentBindingsProvider.unload();
});
afterEach(() => {
  combatTuningAgentBindingsProvider.unload();
});

const validBindings = {
  "char-aggressive": "aggressive-melee",
  "char-defensive": "defensive-ranged",
  "char-cleared": null,
};

describe("CombatTuningAgentBindingsProvider", () => {
  it("starts unloaded with an empty binding record", () => {
    expect(combatTuningAgentBindingsProvider.isLoaded()).toBe(false);
    expect(combatTuningAgentBindingsProvider.getBindings()).toEqual({});
    expect(combatTuningAgentBindingsProvider.getManifest()).toBeNull();
  });

  it("load() installs an already-validated binding record", () => {
    combatTuningAgentBindingsProvider.load(validBindings);
    expect(combatTuningAgentBindingsProvider.isLoaded()).toBe(true);
    expect(combatTuningAgentBindingsProvider.getBindings()).toEqual(
      validBindings,
    );
  });

  it("loadRaw() rejects invalid payloads", () => {
    expect(() =>
      combatTuningAgentBindingsProvider.loadRaw({ "char-1": "" }),
    ).toThrow();
    expect(combatTuningAgentBindingsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts valid payload and returns parsed record", () => {
    const parsed = combatTuningAgentBindingsProvider.loadRaw(validBindings);
    expect(parsed).toEqual(validBindings);
    expect(combatTuningAgentBindingsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(bindings) replaces the current binding record", () => {
    combatTuningAgentBindingsProvider.load(validBindings);
    const replacement = { "char-boss": "boss-tuning" };
    combatTuningAgentBindingsProvider.hotReload(replacement);
    expect(combatTuningAgentBindingsProvider.getBindings()).toEqual(
      replacement,
    );
  });

  it("hotReload(null) clears", () => {
    combatTuningAgentBindingsProvider.load(validBindings);
    combatTuningAgentBindingsProvider.hotReload(null);
    expect(combatTuningAgentBindingsProvider.isLoaded()).toBe(false);
    expect(combatTuningAgentBindingsProvider.getBindings()).toEqual({});
  });

  it("unload() resets to default empty state", () => {
    combatTuningAgentBindingsProvider.load(validBindings);
    combatTuningAgentBindingsProvider.unload();
    expect(combatTuningAgentBindingsProvider.isLoaded()).toBe(false);
    expect(combatTuningAgentBindingsProvider.getManifest()).toBeNull();
  });

  it("getBindings() returns {} (not null) when unloaded — safe to iterate", () => {
    const bindings = combatTuningAgentBindingsProvider.getBindings();
    expect(typeof bindings).toBe("object");
    expect(Object.keys(bindings).length).toBe(0);
  });

  it("accepts null values as explicit-clear markers", () => {
    const bindings = { "char-1": null };
    combatTuningAgentBindingsProvider.loadRaw(bindings);
    expect(combatTuningAgentBindingsProvider.getBindings()).toEqual(bindings);
  });
});
