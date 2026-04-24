import { PluginManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  PluginCatalog,
  PluginCatalogError,
  PluginDependencyCycleError,
  UnknownPluginError,
} from "../PluginCatalog.js";

function plugin(
  id: string,
  deps: { id: string; optional?: boolean }[] = [],
  loadAfter: string[] = [],
) {
  return PluginManifestSchema.parse({
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    dependencies: deps.map((d) => ({
      id: d.id,
      versionRange: "^1.0.0",
      optional: d.optional ?? false,
    })),
    loadAfter,
  });
}

describe("PluginCatalog", () => {
  it("adds and looks up plugins", () => {
    const cat = new PluginCatalog([plugin("com.a.one"), plugin("com.a.two")]);
    expect(cat.size).toBe(2);
    expect(cat.get("com.a.one").name).toBe("com.a.one");
    expect(cat.has("com.a.two")).toBe(true);
    expect(cat.has("com.a.missing")).toBe(false);
  });

  it("throws on unknown lookup", () => {
    const cat = new PluginCatalog([plugin("com.a.one")]);
    expect(() => cat.get("com.a.ghost")).toThrow(UnknownPluginError);
  });

  it("throws on duplicate id", () => {
    const cat = new PluginCatalog([plugin("com.a.one")]);
    expect(() => cat.addPlugin(plugin("com.a.one"))).toThrow(
      PluginCatalogError,
    );
  });

  it("addFromJson parses and indexes", () => {
    const cat = new PluginCatalog();
    cat.addFromJson({
      id: "com.a.raw",
      name: "raw",
      version: "1.0.0",
      entry: "./e.js",
      author: { name: "t" },
      hyperforgeApi: "1.0.0",
    });
    expect(cat.get("com.a.raw").version).toBe("1.0.0");
  });

  it("hardDependencyIds excludes optional", () => {
    const cat = new PluginCatalog([
      plugin("com.a.one", [
        { id: "com.a.hard" },
        { id: "com.a.opt", optional: true },
      ]),
    ]);
    expect(cat.hardDependencyIds("com.a.one")).toEqual(["com.a.hard"]);
  });

  it("missingHardDependencies reports absent ids", () => {
    const cat = new PluginCatalog([
      plugin("com.a.one", [{ id: "com.a.hard" }]),
      plugin("com.a.hard"),
    ]);
    expect(cat.missingHardDependencies("com.a.one")).toEqual([]);

    const cat2 = new PluginCatalog([
      plugin("com.a.one", [{ id: "com.a.hard" }]),
    ]);
    expect(cat2.missingHardDependencies("com.a.one")).toEqual(["com.a.hard"]);
  });

  it("loadOrder topo-sorts by hard deps", () => {
    const cat = new PluginCatalog([
      plugin("com.a.leaf"),
      plugin("com.a.mid", [{ id: "com.a.leaf" }]),
      plugin("com.a.top", [{ id: "com.a.mid" }]),
    ]);
    expect(cat.loadOrder().map((p) => p.id)).toEqual([
      "com.a.leaf",
      "com.a.mid",
      "com.a.top",
    ]);
  });

  it("loadOrder respects loadAfter ordering", () => {
    const cat = new PluginCatalog([
      plugin("com.a.first"),
      plugin("com.a.second", [], ["com.a.first"]),
    ]);
    expect(cat.loadOrder().map((p) => p.id)).toEqual([
      "com.a.first",
      "com.a.second",
    ]);
  });

  it("loadOrder ignores optional deps that aren't in catalog", () => {
    const cat = new PluginCatalog([
      plugin("com.a.only", [{ id: "com.a.gone", optional: true }]),
    ]);
    expect(cat.loadOrder().map((p) => p.id)).toEqual(["com.a.only"]);
  });

  it("loadOrder ignores missing hard deps for ordering purposes", () => {
    // The graph traversal only follows edges whose target is present.
    // Missing hard deps are reported separately via missingHardDependencies.
    const cat = new PluginCatalog([
      plugin("com.a.one", [{ id: "com.a.absent" }]),
    ]);
    expect(cat.loadOrder().map((p) => p.id)).toEqual(["com.a.one"]);
  });

  it("loadOrder throws on cycle", () => {
    const cat = new PluginCatalog([
      plugin("com.a.x", [{ id: "com.a.y" }]),
      plugin("com.a.y", [{ id: "com.a.x" }]),
    ]);
    expect(() => cat.loadOrder()).toThrow(PluginDependencyCycleError);
  });
});
