import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  DuplicatePluginIdError,
  UnknownPluginIdError,
  addPluginToRegistry,
  clearPluginEnabledOverride,
  removePluginFromRegistry,
  replacePluginInRegistry,
  setPluginEnabledOverride,
} from "../PluginRegistryMutations.js";

function manifestInput(id: string, version = "1.0.0"): unknown {
  return {
    id,
    name: id,
    version,
    description: `desc:${id}`,
    entry: "./dist/index.js",
    author: { name: "test" },
    license: "MIT",
    hyperforgeApi: "1.0.0",
    dependencies: [],
  };
}

function buildRegistry(
  ids: readonly string[],
  overrides: Record<string, boolean> = {},
) {
  return PluginRegistryManifestSchema.parse({
    plugins: ids.map((id) => manifestInput(id)),
    enabledByDefault: overrides,
  });
}

describe("setPluginEnabledOverride", () => {
  it("adds a new override without mutating the input registry", () => {
    const registry = buildRegistry(["com.a.one"]);
    const next = setPluginEnabledOverride(registry, "com.a.one", false);
    expect(next.enabledByDefault).toEqual({ "com.a.one": false });
    // Immutability
    expect(registry.enabledByDefault).toEqual({});
    expect(next).not.toBe(registry);
  });

  it("overwrites an existing override", () => {
    const registry = buildRegistry(["com.a.one"], { "com.a.one": true });
    const next = setPluginEnabledOverride(registry, "com.a.one", false);
    expect(next.enabledByDefault).toEqual({ "com.a.one": false });
  });

  it("throws UnknownPluginIdError when id is not in the registry", () => {
    const registry = buildRegistry(["com.a.one"]);
    expect(() =>
      setPluginEnabledOverride(registry, "com.a.ghost", true),
    ).toThrowError(UnknownPluginIdError);
  });

  it("result still round-trips through the Zod schema", () => {
    const registry = buildRegistry(["com.a.one", "com.a.two"]);
    const next = setPluginEnabledOverride(registry, "com.a.two", false);
    expect(() => PluginRegistryManifestSchema.parse(next)).not.toThrow();
  });
});

describe("clearPluginEnabledOverride", () => {
  it("removes the override for the given id", () => {
    const registry = buildRegistry(["com.a.one", "com.a.two"], {
      "com.a.one": true,
      "com.a.two": false,
    });
    const next = clearPluginEnabledOverride(registry, "com.a.one");
    expect(next.enabledByDefault).toEqual({ "com.a.two": false });
  });

  it("returns the same registry reference if the id has no override", () => {
    const registry = buildRegistry(["com.a.one"]);
    const next = clearPluginEnabledOverride(registry, "com.a.one");
    expect(next).toBe(registry);
  });

  it("tolerates unknown ids silently", () => {
    const registry = buildRegistry(["com.a.one"]);
    expect(() =>
      clearPluginEnabledOverride(registry, "com.a.ghost"),
    ).not.toThrow();
  });
});

describe("addPluginToRegistry", () => {
  it("appends the manifest to plugins[]", () => {
    const registry = buildRegistry(["com.a.one"]);
    const newManifest = PluginRegistryManifestSchema.parse({
      plugins: [manifestInput("com.a.two")],
    }).plugins[0];
    const next = addPluginToRegistry(registry, newManifest);
    expect(next.plugins.map((p) => p.id)).toEqual(["com.a.one", "com.a.two"]);
    expect(registry.plugins).toHaveLength(1);
  });

  it("throws DuplicatePluginIdError on id collision", () => {
    const registry = buildRegistry(["com.a.one"]);
    const collision = registry.plugins[0];
    expect(() => addPluginToRegistry(registry, collision)).toThrowError(
      DuplicatePluginIdError,
    );
  });
});

describe("removePluginFromRegistry", () => {
  it("removes the plugin and its enabled override together", () => {
    const registry = buildRegistry(["com.a.one", "com.a.two"], {
      "com.a.one": true,
      "com.a.two": false,
    });
    const next = removePluginFromRegistry(registry, "com.a.one");
    expect(next.plugins.map((p) => p.id)).toEqual(["com.a.two"]);
    expect(next.enabledByDefault).toEqual({ "com.a.two": false });
  });

  it("is idempotent when the id is already absent", () => {
    const registry = buildRegistry(["com.a.one"]);
    const next = removePluginFromRegistry(registry, "com.a.ghost");
    expect(next).toBe(registry);
  });

  it("scrubs a stale override even when the plugin is already gone", () => {
    // The schema refuses dangling overrides at parse time, so we
    // construct a corrupted registry directly to exercise the
    // defensive scrub branch. This protects against subclass /
    // future-edit violations of the invariant.
    const base = buildRegistry(["com.a.one"]);
    const corrupted = {
      ...base,
      enabledByDefault: { "com.a.ghost": true },
    };
    const next = removePluginFromRegistry(corrupted, "com.a.ghost");
    expect(next.enabledByDefault).toEqual({});
  });
});

describe("replacePluginInRegistry", () => {
  it("replaces in place, preserving position and override", () => {
    const registry = buildRegistry(["com.a.one", "com.a.two", "com.a.three"], {
      "com.a.two": false,
    });
    const upgraded = PluginRegistryManifestSchema.parse({
      plugins: [manifestInput("com.a.two", "2.5.0")],
    }).plugins[0] as PluginManifest;
    const next = replacePluginInRegistry(registry, upgraded);
    expect(next.plugins.map((p) => p.id)).toEqual([
      "com.a.one",
      "com.a.two",
      "com.a.three",
    ]);
    expect(next.plugins[1].version).toBe("2.5.0");
    expect(next.enabledByDefault).toEqual({ "com.a.two": false });
  });

  it("throws UnknownPluginIdError when the id is not present", () => {
    const registry = buildRegistry(["com.a.one"]);
    const stranger = PluginRegistryManifestSchema.parse({
      plugins: [manifestInput("com.a.ghost")],
    }).plugins[0] as PluginManifest;
    expect(() => replacePluginInRegistry(registry, stranger)).toThrowError(
      UnknownPluginIdError,
    );
  });
});
