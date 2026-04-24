import { PluginRegistryManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  buildPluginCatalogFromRegistry,
  listPluginsEnabledByDefault,
  resolvePluginEnabledByDefault,
} from "../PluginRegistryBridge.js";

function plugin(id: string, enabledByDefault = true) {
  return {
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    enabledByDefault,
  };
}

describe("PluginRegistryBridge", () => {
  it("builds an empty catalog from an empty registry", () => {
    const reg = PluginRegistryManifestSchema.parse({});
    const catalog = buildPluginCatalogFromRegistry(reg);
    expect(catalog.size).toBe(0);
  });

  it("builds a catalog preserving manifest order", () => {
    const reg = PluginRegistryManifestSchema.parse({
      plugins: [plugin("com.a.one"), plugin("com.a.two")],
    });
    const catalog = buildPluginCatalogFromRegistry(reg);
    expect(catalog.plugins().map((p) => p.id)).toEqual([
      "com.a.one",
      "com.a.two",
    ]);
  });

  it("resolvePluginEnabledByDefault returns plugin flag when no override", () => {
    const reg = PluginRegistryManifestSchema.parse({
      plugins: [plugin("com.a.on", true), plugin("com.a.off", false)],
    });
    expect(resolvePluginEnabledByDefault(reg, "com.a.on")).toBe(true);
    expect(resolvePluginEnabledByDefault(reg, "com.a.off")).toBe(false);
  });

  it("resolvePluginEnabledByDefault override wins over plugin flag", () => {
    const reg = PluginRegistryManifestSchema.parse({
      plugins: [plugin("com.a.on", true), plugin("com.a.off", false)],
      enabledByDefault: {
        "com.a.on": false,
        "com.a.off": true,
      },
    });
    expect(resolvePluginEnabledByDefault(reg, "com.a.on")).toBe(false);
    expect(resolvePluginEnabledByDefault(reg, "com.a.off")).toBe(true);
  });

  it("resolvePluginEnabledByDefault throws on unknown plugin id", () => {
    const reg = PluginRegistryManifestSchema.parse({
      plugins: [plugin("com.a.one")],
    });
    expect(() => resolvePluginEnabledByDefault(reg, "com.a.ghost")).toThrow(
      /not present in the registry/,
    );
  });

  it("listPluginsEnabledByDefault returns only enabled ids in manifest order", () => {
    const reg = PluginRegistryManifestSchema.parse({
      plugins: [
        plugin("com.a.on", true),
        plugin("com.a.off", false),
        plugin("com.a.overridden-off", true),
        plugin("com.a.overridden-on", false),
      ],
      enabledByDefault: {
        "com.a.overridden-off": false,
        "com.a.overridden-on": true,
      },
    });
    expect(listPluginsEnabledByDefault(reg)).toEqual([
      "com.a.on",
      "com.a.overridden-on",
    ]);
  });

  it("listPluginsEnabledByDefault is empty when no plugins", () => {
    const reg = PluginRegistryManifestSchema.parse({});
    expect(listPluginsEnabledByDefault(reg)).toEqual([]);
  });
});
