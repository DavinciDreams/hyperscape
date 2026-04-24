import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContextScope } from "../PluginContextScope.js";
import { type PluginContextBase, PluginHost } from "../PluginHost.js";
import { buildPluginCatalogFromRegistry } from "../PluginRegistryBridge.js";
import {
  computeDisableImpact,
  directDependentsOf,
  transitiveDependenciesOf,
  transitiveDependentsOf,
} from "../PluginDependencyGraph.js";

interface TestCtx extends PluginContextBase {}

function manifestFor(
  id: string,
  hardDeps: string[] = [],
  optionalDeps: string[] = [],
): PluginManifest {
  const dependencies = [
    ...hardDeps.map((d) => ({ id: d, versionRange: "^1.0.0" })),
    ...optionalDeps.map((d) => ({
      id: d,
      versionRange: "^1.0.0",
      optional: true,
    })),
  ];
  return {
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    dependencies,
  } as PluginManifest;
}

function buildCtx(m: { id: string }, scope: PluginContextScope): TestCtx {
  return { pluginId: m.id, scope };
}

function mkCatalog(plugins: PluginManifest[]) {
  const registry = PluginRegistryManifestSchema.parse({ plugins });
  return buildPluginCatalogFromRegistry(registry);
}

describe("directDependentsOf", () => {
  it("returns [] for a plugin with no dependents", () => {
    const catalog = mkCatalog([manifestFor("com.a.one")]);
    expect(directDependentsOf(catalog, "com.a.one")).toEqual([]);
  });

  it("returns [] when the id is not in the catalog", () => {
    const catalog = mkCatalog([manifestFor("com.a.one")]);
    expect(directDependentsOf(catalog, "com.a.ghost")).toEqual([]);
  });

  it("lists plugins that declare id as a hard dep", () => {
    const catalog = mkCatalog([
      manifestFor("com.a.root"),
      manifestFor("com.a.child", ["com.a.root"]),
      manifestFor("com.a.sibling", ["com.a.root"]),
      manifestFor("com.a.unrelated"),
    ]);
    expect(directDependentsOf(catalog, "com.a.root").sort()).toEqual([
      "com.a.child",
      "com.a.sibling",
    ]);
  });

  it("ignores optional dependents", () => {
    const catalog = mkCatalog([
      manifestFor("com.a.root"),
      manifestFor("com.a.hard", ["com.a.root"]),
      manifestFor("com.a.soft", [], ["com.a.root"]),
    ]);
    expect(directDependentsOf(catalog, "com.a.root")).toEqual(["com.a.hard"]);
  });
});

describe("transitiveDependentsOf", () => {
  it("walks the reverse chain in BFS order", () => {
    // root <- a <- b <- c
    //      <- d
    const catalog = mkCatalog([
      manifestFor("com.a.root"),
      manifestFor("com.a.a", ["com.a.root"]),
      manifestFor("com.a.b", ["com.a.a"]),
      manifestFor("com.a.c", ["com.a.b"]),
      manifestFor("com.a.d", ["com.a.root"]),
    ]);
    const result = transitiveDependentsOf(catalog, "com.a.root");
    // Ring 1: a, d (alphabetical via catalog.ids). Ring 2: b. Ring 3: c.
    expect(result).toContain("com.a.a");
    expect(result).toContain("com.a.b");
    expect(result).toContain("com.a.c");
    expect(result).toContain("com.a.d");
    expect(result.indexOf("com.a.a")).toBeLessThan(result.indexOf("com.a.b"));
    expect(result.indexOf("com.a.b")).toBeLessThan(result.indexOf("com.a.c"));
  });

  it("returns [] when the id has no dependents", () => {
    const catalog = mkCatalog([manifestFor("com.a.root")]);
    expect(transitiveDependentsOf(catalog, "com.a.root")).toEqual([]);
  });
});

describe("transitiveDependenciesOf", () => {
  it("walks the forward chain in BFS order, excluding the start node", () => {
    // c -> b -> a -> root
    const catalog = mkCatalog([
      manifestFor("com.a.root"),
      manifestFor("com.a.a", ["com.a.root"]),
      manifestFor("com.a.b", ["com.a.a"]),
      manifestFor("com.a.c", ["com.a.b"]),
    ]);
    expect(transitiveDependenciesOf(catalog, "com.a.c")).toEqual([
      "com.a.b",
      "com.a.a",
      "com.a.root",
    ]);
  });

  it("skips optional deps", () => {
    const catalog = mkCatalog([
      manifestFor("com.a.root"),
      manifestFor("com.a.soft"),
      manifestFor("com.a.x", ["com.a.root"], ["com.a.soft"]),
    ]);
    expect(transitiveDependenciesOf(catalog, "com.a.x")).toEqual([
      "com.a.root",
    ]);
  });

  it("skips unresolved dep ids", () => {
    const catalog = mkCatalog([manifestFor("com.a.x", ["com.a.ghost"])]);
    expect(transitiveDependenciesOf(catalog, "com.a.x")).toEqual([]);
  });
});

describe("computeDisableImpact", () => {
  it("returns [] when the target has no dependents", async () => {
    const catalog = mkCatalog([manifestFor("com.a.root")]);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    host.registerPlugin("com.a.root", () => ({}));
    await host.loadAndEnable();
    expect(computeDisableImpact(catalog, host, "com.a.root")).toEqual([]);
  });

  it("lists enabled dependents with their via-path", async () => {
    // root <- a <- b
    const catalog = mkCatalog([
      manifestFor("com.a.root"),
      manifestFor("com.a.a", ["com.a.root"]),
      manifestFor("com.a.b", ["com.a.a"]),
    ]);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    host.registerPlugin("com.a.root", () => ({}));
    host.registerPlugin("com.a.a", () => ({}));
    host.registerPlugin("com.a.b", () => ({}));
    await host.loadAndEnable();
    const impact = computeDisableImpact(catalog, host, "com.a.root");
    expect(impact.map((i) => i.pluginId).sort()).toEqual([
      "com.a.a",
      "com.a.b",
    ]);
    const bEntry = impact.find((i) => i.pluginId === "com.a.b")!;
    // shortest path from b to root: b -> a -> root
    expect(bEntry.via).toEqual(["com.a.b", "com.a.a", "com.a.root"]);
    expect(bEntry.currentState).toBe("enabled");
  });

  it("skips dependents that aren't currently enabled", async () => {
    const catalog = mkCatalog([
      manifestFor("com.a.root"),
      manifestFor("com.a.a", ["com.a.root"]),
    ]);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    host.registerPlugin("com.a.root", () => ({}));
    host.registerPlugin("com.a.a", () => ({}));
    // Load but don't enable — state is "loaded", which IS included
    // (one transition away from enabled and still counts as at-risk).
    await host.loadAll();
    const loadedImpact = computeDisableImpact(catalog, host, "com.a.root");
    expect(loadedImpact).toHaveLength(1);
    expect(loadedImpact[0].currentState).toBe("loaded");

    // Now disable and re-query — "disabled" state is skipped.
    await host.enableAll();
    await host.disableAll();
    const disabledImpact = computeDisableImpact(catalog, host, "com.a.root");
    expect(disabledImpact).toEqual([]);
  });

  it("does not double-count when a dependent reaches root via multiple paths", async () => {
    //       root
    //      /    \
    //     a      b
    //      \    /
    //        c   (depends on both a and b)
    const catalog = mkCatalog([
      manifestFor("com.a.root"),
      manifestFor("com.a.a", ["com.a.root"]),
      manifestFor("com.a.b", ["com.a.root"]),
      manifestFor("com.a.c", ["com.a.a", "com.a.b"]),
    ]);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    host.registerPlugin("com.a.root", () => ({}));
    host.registerPlugin("com.a.a", () => ({}));
    host.registerPlugin("com.a.b", () => ({}));
    host.registerPlugin("com.a.c", () => ({}));
    await host.loadAndEnable();
    const impact = computeDisableImpact(catalog, host, "com.a.root");
    expect(impact.map((i) => i.pluginId).sort()).toEqual([
      "com.a.a",
      "com.a.b",
      "com.a.c",
    ]);
    // c should report shortest path (c -> a -> root, ties broken by
    // catalog iteration order).
    const cEntry = impact.find((i) => i.pluginId === "com.a.c")!;
    expect(cEntry.via.length).toBe(3);
    expect(cEntry.via[0]).toBe("com.a.c");
    expect(cEntry.via[cEntry.via.length - 1]).toBe("com.a.root");
  });
});
