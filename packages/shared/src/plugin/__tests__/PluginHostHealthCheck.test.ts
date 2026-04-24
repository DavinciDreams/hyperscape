import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContextScope } from "../PluginContextScope.js";
import { type PluginContextBase, PluginHost } from "../PluginHost.js";
import { buildPluginCatalogFromRegistry } from "../PluginRegistryBridge.js";
import { checkPluginHostHealth } from "../PluginHostHealthCheck.js";

interface TestCtx extends PluginContextBase {}

function buildCtx(m: { id: string }, scope: PluginContextScope): TestCtx {
  return { pluginId: m.id, scope };
}

function manifestFor(
  id: string,
  deps: Array<string | { id: string; versionRange: string }> = [],
  version = "1.0.0",
): PluginManifest {
  const dependencies = deps.map((d) =>
    typeof d === "string" ? { id: d, versionRange: "^1.0.0" } : d,
  );
  return {
    id,
    name: id,
    version,
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    dependencies,
  } as PluginManifest;
}

function mkHost(plugins: PluginManifest[]) {
  const registry = PluginRegistryManifestSchema.parse({ plugins });
  const catalog = buildPluginCatalogFromRegistry(registry);
  return new PluginHost<TestCtx>(catalog, buildCtx);
}

describe("checkPluginHostHealth", () => {
  it("reports healthy: true when every plugin has a factory and deps resolve", () => {
    const host = mkHost([manifestFor("com.a.one"), manifestFor("com.a.two")]);
    host.registerPlugin("com.a.one", () => ({}));
    host.registerPlugin("com.a.two", () => ({}));
    const report = checkPluginHostHealth(host);
    expect(report.healthy).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("reports missing-factory for plugins not yet bound", () => {
    const host = mkHost([manifestFor("com.a.one"), manifestFor("com.a.two")]);
    host.registerPlugin("com.a.one", () => ({}));
    const report = checkPluginHostHealth(host);
    expect(report.healthy).toBe(false);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      kind: "missing-factory",
      pluginId: "com.a.two",
    });
  });

  it("reports a missing-factory per unbound plugin", () => {
    const host = mkHost([
      manifestFor("com.a.one"),
      manifestFor("com.a.two"),
      manifestFor("com.a.three"),
    ]);
    const report = checkPluginHostHealth(host);
    expect(
      report.issues.filter((i) => i.kind === "missing-factory"),
    ).toHaveLength(3);
    expect(
      report.issues
        .filter((i) => i.kind === "missing-factory")
        .map((i) => i.pluginId)
        .sort(),
    ).toEqual(["com.a.one", "com.a.three", "com.a.two"]);
  });

  it("reports missing-hard-dependency when a declared dep is absent from the registry", () => {
    // Build a catalog from a registry that contains only the dependent;
    // the dep id it references is unresolved.
    // (The registry schema does not require declared dep ids to be
    // present in the same registry — it's a valid authoring state that
    // health-check surfaces as an issue.)
    const host = mkHost([
      manifestFor("com.a.dependent", ["com.a.missing-dep"]),
    ]);
    host.registerPlugin("com.a.dependent", () => ({}));
    const report = checkPluginHostHealth(host);
    expect(report.healthy).toBe(false);
    const issue = report.issues.find(
      (i) => i.kind === "missing-hard-dependency",
    );
    expect(issue).toBeDefined();
    expect(issue!.pluginId).toBe("com.a.dependent");
    expect(issue!.details?.missingDependencyIds).toEqual(["com.a.missing-dep"]);
  });

  it("reports dependency-cycle once with cyclePath details", () => {
    const host = mkHost([
      manifestFor("com.a.one", ["com.a.two"]),
      manifestFor("com.a.two", ["com.a.one"]),
    ]);
    host.registerPlugin("com.a.one", () => ({}));
    host.registerPlugin("com.a.two", () => ({}));
    const report = checkPluginHostHealth(host);
    expect(report.healthy).toBe(false);
    const cycleIssues = report.issues.filter(
      (i) => i.kind === "dependency-cycle",
    );
    expect(cycleIssues).toHaveLength(1);
    expect(cycleIssues[0].details?.cyclePath?.length).toBeGreaterThanOrEqual(2);
  });

  it("aggregates multiple issue kinds in one report", () => {
    const host = mkHost([
      manifestFor("com.a.one"),
      manifestFor("com.a.two", ["com.a.missing-dep"]),
    ]);
    // com.a.one has no factory → missing-factory
    // com.a.two has no factory AND unresolved dep → two issues
    const report = checkPluginHostHealth(host);
    const kinds = report.issues.map((i) => i.kind).sort();
    expect(kinds).toEqual([
      "missing-factory",
      "missing-factory",
      "missing-hard-dependency",
    ]);
  });

  it("empty registry is vacuously healthy", () => {
    const host = mkHost([]);
    const report = checkPluginHostHealth(host);
    expect(report.healthy).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("accepts a satisfied versionRange without raising any issue", () => {
    const host = mkHost([
      manifestFor("com.a.one", [{ id: "com.a.two", versionRange: "^1.0.0" }]),
      manifestFor("com.a.two", [], "1.2.5"),
    ]);
    host.registerPlugin("com.a.one", () => ({}));
    host.registerPlugin("com.a.two", () => ({}));
    const report = checkPluginHostHealth(host);
    expect(report.healthy).toBe(true);
  });

  it("reports version-mismatch when the resolved dep version is below the range", () => {
    const host = mkHost([
      manifestFor("com.a.one", [{ id: "com.a.two", versionRange: "^2.0.0" }]),
      manifestFor("com.a.two", [], "1.5.0"),
    ]);
    host.registerPlugin("com.a.one", () => ({}));
    host.registerPlugin("com.a.two", () => ({}));
    const report = checkPluginHostHealth(host);
    expect(report.healthy).toBe(false);
    const issue = report.issues.find((i) => i.kind === "version-mismatch");
    expect(issue).toBeDefined();
    expect(issue!.pluginId).toBe("com.a.one");
    expect(issue!.details).toMatchObject({
      dependencyId: "com.a.two",
      requiredRange: "^2.0.0",
      resolvedVersion: "1.5.0",
    });
  });

  it("reports version-mismatch when the resolved dep major is above a caret range", () => {
    const host = mkHost([
      manifestFor("com.a.one", [{ id: "com.a.two", versionRange: "^1.0.0" }]),
      manifestFor("com.a.two", [], "3.0.0"),
    ]);
    host.registerPlugin("com.a.one", () => ({}));
    host.registerPlugin("com.a.two", () => ({}));
    const report = checkPluginHostHealth(host);
    const issue = report.issues.find((i) => i.kind === "version-mismatch");
    expect(issue?.details?.resolvedVersion).toBe("3.0.0");
  });

  it("accepts space-joined AND ranges", () => {
    const host = mkHost([
      manifestFor("com.a.one", [
        { id: "com.a.two", versionRange: ">=1.0.0 <3.0.0" },
      ]),
      manifestFor("com.a.two", [], "2.5.0"),
    ]);
    host.registerPlugin("com.a.one", () => ({}));
    host.registerPlugin("com.a.two", () => ({}));
    const report = checkPluginHostHealth(host);
    expect(report.healthy).toBe(true);
  });

  it("reports invalid-version-range when the declared range is unparseable", () => {
    const host = mkHost([
      manifestFor("com.a.one", [{ id: "com.a.two", versionRange: "!!!" }]),
      manifestFor("com.a.two", [], "1.0.0"),
    ]);
    host.registerPlugin("com.a.one", () => ({}));
    host.registerPlugin("com.a.two", () => ({}));
    const report = checkPluginHostHealth(host);
    const issue = report.issues.find((i) => i.kind === "invalid-version-range");
    expect(issue).toBeDefined();
    expect(issue!.pluginId).toBe("com.a.one");
    expect(issue!.details?.dependencyId).toBe("com.a.two");
    expect(issue!.details?.requiredRange).toBe("!!!");
  });

  it("does not version-check dependencies that are absent from the registry", () => {
    // missing-hard-dependency already covers the absence;
    // version-mismatch would double-fire if we didn't skip.
    const host = mkHost([
      manifestFor("com.a.one", [
        { id: "com.a.missing", versionRange: "^99.0.0" },
      ]),
    ]);
    host.registerPlugin("com.a.one", () => ({}));
    const report = checkPluginHostHealth(host);
    expect(
      report.issues.filter((i) => i.kind === "version-mismatch"),
    ).toHaveLength(0);
    expect(
      report.issues.filter((i) => i.kind === "missing-hard-dependency"),
    ).toHaveLength(1);
  });
});
