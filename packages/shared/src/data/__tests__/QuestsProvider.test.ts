/**
 * Tests for the QuestsProvider singleton.
 *
 * Safe baseline `{}` (empty quest registry) works without fixture.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { questsProvider } from "../QuestsProvider";

beforeEach(() => {
  questsProvider.unload();
});
afterEach(() => {
  questsProvider.unload();
});

describe("QuestsProvider", () => {
  it("starts unloaded", () => {
    expect(questsProvider.isLoaded()).toBe(false);
    expect(questsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts {} as a safe baseline", () => {
    const parsed = questsProvider.loadRaw({});
    expect(Object.keys(parsed).length).toBe(0);
    expect(questsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects non-object", () => {
    expect(() => questsProvider.loadRaw("not-an-object")).toThrow();
    expect(() => questsProvider.loadRaw(42)).toThrow();
    expect(() => questsProvider.loadRaw([])).toThrow();
  });

  it("loadRaw() rejects a quest entry missing required fields", () => {
    expect(() => questsProvider.loadRaw({ q1: {} })).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = questsProvider.loadRaw({});
    questsProvider.unload();
    questsProvider.load(parsed);
    expect(questsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    questsProvider.loadRaw({});
    questsProvider.hotReload(null);
    expect(questsProvider.isLoaded()).toBe(false);
  });

  it("unload() removes the manifest", () => {
    questsProvider.loadRaw({});
    questsProvider.unload();
    expect(questsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(questsProvider).toBe(questsProvider);
  });
});
