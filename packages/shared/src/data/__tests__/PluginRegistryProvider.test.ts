/**
 * Tests for the PluginRegistryProvider singleton.
 *
 * Safe baseline `{}` parses into `{ plugins: [], enabledByDefault: {} }`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pluginRegistryProvider } from "../PluginRegistryProvider";

function pluginEntry(id: string) {
  return {
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
  };
}

beforeEach(() => {
  pluginRegistryProvider.unload();
});
afterEach(() => {
  pluginRegistryProvider.unload();
});

describe("PluginRegistryProvider", () => {
  it("starts unloaded", () => {
    expect(pluginRegistryProvider.isLoaded()).toBe(false);
    expect(pluginRegistryProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts {} as a safe baseline", () => {
    const parsed = pluginRegistryProvider.loadRaw({});
    expect(parsed.plugins).toEqual([]);
    expect(parsed.enabledByDefault).toEqual({});
    expect(pluginRegistryProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a populated registry", () => {
    const parsed = pluginRegistryProvider.loadRaw({
      plugins: [pluginEntry("com.a.one"), pluginEntry("com.a.two")],
      enabledByDefault: { "com.a.one": false },
    });
    expect(parsed.plugins.map((p) => p.id)).toEqual(["com.a.one", "com.a.two"]);
    expect(parsed.enabledByDefault["com.a.one"]).toBe(false);
  });

  it("loadRaw() rejects duplicate plugin ids", () => {
    expect(() =>
      pluginRegistryProvider.loadRaw({
        plugins: [pluginEntry("com.a.one"), pluginEntry("com.a.one")],
      }),
    ).toThrow(/unique plugin ids/);
  });

  it("loadRaw() rejects enabledByDefault keys for unknown plugins", () => {
    expect(() =>
      pluginRegistryProvider.loadRaw({
        plugins: [pluginEntry("com.a.one")],
        enabledByDefault: { "com.a.ghost": false },
      }),
    ).toThrow(/enabledByDefault keys/);
  });

  it("loadRaw() rejects non-object inputs", () => {
    expect(() => pluginRegistryProvider.loadRaw("no")).toThrow();
    expect(() => pluginRegistryProvider.loadRaw(42)).toThrow();
    expect(() => pluginRegistryProvider.loadRaw([])).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = pluginRegistryProvider.loadRaw({});
    pluginRegistryProvider.unload();
    pluginRegistryProvider.load(parsed);
    expect(pluginRegistryProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    pluginRegistryProvider.loadRaw({});
    pluginRegistryProvider.hotReload(null);
    expect(pluginRegistryProvider.isLoaded()).toBe(false);
  });

  it("unload() removes the manifest", () => {
    pluginRegistryProvider.loadRaw({});
    pluginRegistryProvider.unload();
    expect(pluginRegistryProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(pluginRegistryProvider).toBe(pluginRegistryProvider);
  });
});
