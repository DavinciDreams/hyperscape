import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContextScope } from "../PluginContextScope.js";
import { type PluginContextBase, PluginHost } from "../PluginHost.js";
import { buildPluginCatalogFromRegistry } from "../PluginRegistryBridge.js";
import { buildPluginBrowserSnapshot } from "../PluginBrowserSnapshot.js";
import { checkPluginHostHealth } from "../PluginHostHealthCheck.js";
import { createPluginHostFromRegistry } from "../PluginRegistryBootstrap.js";

interface TestCtx extends PluginContextBase {}

function manifestInput(
  id: string,
  overrides: Partial<PluginManifest> = {},
  deps: string[] = [],
): unknown {
  return {
    id,
    name: overrides.name ?? `name:${id}`,
    version: overrides.version ?? "1.2.3",
    description: overrides.description ?? `desc:${id}`,
    author: overrides.author ?? { name: `author:${id}` },
    license: overrides.license ?? "MIT",
    hyperforgeApi: "1.0.0",
    entry: "./dist/index.js",
    dependencies: deps.map((d) => ({ id: d, versionRange: "^1.0.0" })),
    tags: overrides.tags,
    contributions: overrides.contributions,
  };
}

function buildCtx(
  manifest: { id: string },
  scope: PluginContextScope,
): TestCtx {
  return { pluginId: manifest.id, scope };
}

describe("buildPluginBrowserSnapshot", () => {
  it("returns [] for an empty registry", () => {
    const registry = PluginRegistryManifestSchema.parse({});
    const catalog = buildPluginCatalogFromRegistry(registry);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    expect(buildPluginBrowserSnapshot(registry, host)).toEqual([]);
  });

  it("emits rows in manifest order, regardless of factory registration order", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        manifestInput("com.a.one"),
        manifestInput("com.a.two"),
        manifestInput("com.a.three"),
      ],
    });
    const host = createPluginHostFromRegistry<TestCtx>({
      registry,
      buildContext: buildCtx,
      factories: {
        // deliberately out-of-order
        "com.a.three": () => ({}),
        "com.a.one": () => ({}),
        "com.a.two": () => ({}),
      },
    });
    const rows = buildPluginBrowserSnapshot(registry, host);
    expect(rows.map((r) => r.id)).toEqual([
      "com.a.one",
      "com.a.two",
      "com.a.three",
    ]);
  });

  it("surfaces author-facing metadata from the manifest", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        manifestInput("com.a.one", {
          name: "Plugin One",
          version: "2.0.0",
          description: "first plugin",
          author: { name: "Alice" },
          license: "Apache-2.0",
          tags: ["tagA", "tagB"],
        }),
      ],
    });
    const catalog = buildPluginCatalogFromRegistry(registry);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    const [row] = buildPluginBrowserSnapshot(registry, host);
    expect(row).toMatchObject({
      id: "com.a.one",
      name: "Plugin One",
      version: "2.0.0",
      description: "first plugin",
      author: "Alice",
      license: "Apache-2.0",
      tags: ["tagA", "tagB"],
    });
  });

  it("reflects hasFactory=false + state='registered' for plugins with no factory", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [manifestInput("com.a.pending")],
    });
    const catalog = buildPluginCatalogFromRegistry(registry);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    const [row] = buildPluginBrowserSnapshot(registry, host);
    expect(row.hasFactory).toBe(false);
    expect(row.state).toBe("registered");
    expect(row.errorMessage).toBeNull();
  });

  it("reflects lifecycle states across load/enable/disable", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [manifestInput("com.a.one")],
    });
    const host = createPluginHostFromRegistry<TestCtx>({
      registry,
      buildContext: buildCtx,
      factories: {
        "com.a.one": () => ({}),
      },
    });
    expect(buildPluginBrowserSnapshot(registry, host)[0].state).toBe(
      "registered",
    );

    await host.loadAll();
    expect(buildPluginBrowserSnapshot(registry, host)[0].state).toBe("loaded");

    await host.enableAll();
    expect(buildPluginBrowserSnapshot(registry, host)[0].state).toBe("enabled");

    await host.disableAll();
    expect(buildPluginBrowserSnapshot(registry, host)[0].state).toBe(
      "disabled",
    );
  });

  it("surfaces declared dependency ids", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        manifestInput("com.a.one"),
        manifestInput("com.a.two", {}, ["com.a.one"]),
      ],
    });
    const catalog = buildPluginCatalogFromRegistry(registry);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    const rows = buildPluginBrowserSnapshot(registry, host);
    expect(rows[0].dependencyIds).toEqual([]);
    expect(rows[1].dependencyIds).toEqual(["com.a.one"]);
  });

  it("counts contribution surfaces", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        manifestInput("com.a.one", {
          contributions: {
            systems: ["sys1", "sys2"],
            entities: ["entity1"],
            widgets: [],
            manifestSchemas: ["schemaX"],
            paletteCategories: ["cat1", "cat2", "cat3"],
            toolbarTools: ["tool1"],
            commands: [],
          },
        }),
      ],
    });
    const catalog = buildPluginCatalogFromRegistry(registry);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    const [row] = buildPluginBrowserSnapshot(registry, host);
    expect(row.contributions).toEqual({
      systems: 2,
      entities: 1,
      widgets: 0,
      manifestSchemas: 1,
      paletteCategories: 3,
      toolbarTools: 1,
      commands: 0,
    });
  });

  it("registry-level enabledByDefault override beats the plugin's own flag", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        // plugin-level enabledByDefault defaults to true
        manifestInput("com.a.one"),
        manifestInput("com.a.two"),
      ],
      enabledByDefault: {
        "com.a.one": false,
      },
    });
    const catalog = buildPluginCatalogFromRegistry(registry);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    const rows = buildPluginBrowserSnapshot(registry, host);
    expect(rows[0].enabledByDefault).toBe(false);
    expect(rows[1].enabledByDefault).toBe(true);
  });

  it("propagates lifecycle error messages when a plugin fails", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [manifestInput("com.a.boom")],
    });
    const host = createPluginHostFromRegistry<TestCtx>({
      registry,
      buildContext: buildCtx,
      factories: {
        "com.a.boom": () => ({
          onLoad() {
            throw new Error("load exploded");
          },
        }),
      },
    });
    await expect(host.loadAll()).rejects.toThrow();
    const [row] = buildPluginBrowserSnapshot(registry, host);
    expect(row.state).toBe("failed");
    expect(row.errorMessage).toBe("load exploded");
  });

  it("defaults healthIssues to [] when no health report is passed", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [manifestInput("com.a.one")],
    });
    const catalog = buildPluginCatalogFromRegistry(registry);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    const [row] = buildPluginBrowserSnapshot(registry, host);
    expect(row.healthIssues).toEqual([]);
  });

  it("attributes missing-factory issues to the pending plugin when a health report is passed", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [manifestInput("com.a.one"), manifestInput("com.a.two")],
    });
    const host = createPluginHostFromRegistry<TestCtx>({
      registry,
      buildContext: buildCtx,
      factories: {
        "com.a.one": () => ({}),
        // com.a.two intentionally unbound → missing-factory
      },
    });
    const report = checkPluginHostHealth(host);
    const rows = buildPluginBrowserSnapshot(registry, host, report);
    const [rowOne, rowTwo] = rows;
    expect(rowOne.healthIssues).toEqual([]);
    expect(rowTwo.healthIssues).toHaveLength(1);
    expect(rowTwo.healthIssues[0].kind).toBe("missing-factory");
  });

  it("surfaces version-mismatch issues on the dependent plugin's row", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        {
          ...(manifestInput("com.a.dependent") as object),
          dependencies: [{ id: "com.a.dep", versionRange: "^2.0.0" }],
        },
        manifestInput("com.a.dep", { version: "1.0.0" }),
      ],
    });
    const host = createPluginHostFromRegistry<TestCtx>({
      registry,
      buildContext: buildCtx,
      factories: {
        "com.a.dependent": () => ({}),
        "com.a.dep": () => ({}),
      },
    });
    const report = checkPluginHostHealth(host);
    const rows = buildPluginBrowserSnapshot(registry, host, report);
    const dependentRow = rows.find((r) => r.id === "com.a.dependent")!;
    const depRow = rows.find((r) => r.id === "com.a.dep")!;
    const mismatch = dependentRow.healthIssues.find(
      (i) => i.kind === "version-mismatch",
    );
    expect(mismatch).toBeDefined();
    expect(mismatch!.details?.requiredRange).toBe("^2.0.0");
    expect(mismatch!.details?.resolvedVersion).toBe("1.0.0");
    // Dep itself carries no issue for its own row.
    expect(
      depRow.healthIssues.find((i) => i.kind === "version-mismatch"),
    ).toBeUndefined();
  });

  it("buckets multiple issues to the same plugin row", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        {
          ...(manifestInput("com.a.one") as object),
          dependencies: [
            { id: "com.a.missing", versionRange: "^1.0.0" },
            { id: "com.a.also-missing", versionRange: "^1.0.0" },
          ],
        },
      ],
    });
    // No factory bound → missing-factory + two missing-hard-dependency.
    const catalog = buildPluginCatalogFromRegistry(registry);
    const host = new PluginHost<TestCtx>(catalog, buildCtx);
    const report = checkPluginHostHealth(host);
    const [row] = buildPluginBrowserSnapshot(registry, host, report);
    const kinds = row.healthIssues.map((i) => i.kind).sort();
    expect(kinds).toEqual(["missing-factory", "missing-hard-dependency"]);
  });
});
