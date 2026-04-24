import { describe, expect, it } from "vitest";
import { PluginRegistryManifestSchema } from "./plugin-registry.js";

function manifest(id: string) {
  return {
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
  };
}

describe("PluginRegistryManifestSchema", () => {
  it("accepts an empty registry", () => {
    const r = PluginRegistryManifestSchema.parse({});
    expect(r.plugins).toEqual([]);
    expect(r.enabledByDefault).toEqual({});
  });

  it("accepts a populated registry", () => {
    const r = PluginRegistryManifestSchema.parse({
      plugins: [manifest("com.a.one"), manifest("com.a.two")],
    });
    expect(r.plugins.map((p) => p.id)).toEqual(["com.a.one", "com.a.two"]);
  });

  it("rejects duplicate plugin ids", () => {
    expect(() =>
      PluginRegistryManifestSchema.parse({
        plugins: [manifest("com.a.one"), manifest("com.a.one")],
      }),
    ).toThrow(/unique plugin ids/);
  });

  it("accepts enabledByDefault overrides for registered plugins", () => {
    const r = PluginRegistryManifestSchema.parse({
      plugins: [manifest("com.a.one"), manifest("com.a.two")],
      enabledByDefault: { "com.a.one": false, "com.a.two": true },
    });
    expect(r.enabledByDefault["com.a.one"]).toBe(false);
    expect(r.enabledByDefault["com.a.two"]).toBe(true);
  });

  it("rejects enabledByDefault keys for unknown plugin ids", () => {
    expect(() =>
      PluginRegistryManifestSchema.parse({
        plugins: [manifest("com.a.one")],
        enabledByDefault: { "com.a.ghost": false },
      }),
    ).toThrow(/enabledByDefault keys/);
  });

  it("propagates per-plugin refinement failures", () => {
    expect(() =>
      PluginRegistryManifestSchema.parse({
        plugins: [
          // invalid: self-dependency
          {
            ...manifest("com.a.self"),
            dependencies: [{ id: "com.a.self", versionRange: "^1.0.0" }],
          },
        ],
      }),
    ).toThrow();
  });
});
