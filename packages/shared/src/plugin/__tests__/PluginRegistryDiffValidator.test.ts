import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { diffPluginRegistries } from "../PluginManifestDiff.js";
import { validatePluginRegistryDiff } from "../PluginRegistryDiffValidator.js";

function plugin(id: string, overrides: Record<string, unknown> = {}) {
  return PluginManifestSchema.parse({
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "Author" },
    hyperforgeApi: "1.0.0",
    ...overrides,
  });
}

function registry(plugins: ReturnType<typeof plugin>[]) {
  return PluginRegistryManifestSchema.parse({ plugins });
}

describe("validatePluginRegistryDiff — clean cases", () => {
  it("reports no issues for an empty diff against a self-consistent registry", () => {
    const current = registry([plugin("com.a"), plugin("com.b")]);
    const diff = diffPluginRegistries(current, current);
    const report = validatePluginRegistryDiff(current, current, diff);
    expect(report.issues).toEqual([]);
    expect(report.canApply).toBe(true);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
  });

  it("reports no issues when adding a plugin whose deps are present", () => {
    const current = registry([plugin("com.dep")]);
    const next = registry([
      plugin("com.dep"),
      plugin("com.user", {
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
    ]);
    const diff = diffPluginRegistries(current, next);
    const report = validatePluginRegistryDiff(current, next, diff);
    expect(report.canApply).toBe(true);
    expect(report.issues).toEqual([]);
  });
});

describe("validatePluginRegistryDiff — broken-dependency", () => {
  it("flags a hard dep that's missing from the projected registry", () => {
    const current = registry([]);
    const next = registry([
      plugin("com.user", {
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
    ]);
    const diff = diffPluginRegistries(current, next);
    const report = validatePluginRegistryDiff(current, next, diff);
    expect(report.canApply).toBe(false);
    expect(report.errorCount).toBe(1);
    expect(report.issues[0]).toMatchObject({
      kind: "broken-dependency",
      severity: "error",
      pluginId: "com.user",
      relatedPluginId: "com.dep",
      requiredRange: "^1.0.0",
    });
  });
});

describe("validatePluginRegistryDiff — optional-dependency-missing (warning)", () => {
  it("flags a missing optional dep at warning severity", () => {
    const current = registry([]);
    const next = registry([
      plugin("com.user", {
        dependencies: [
          { id: "com.dep", versionRange: "^1.0.0", optional: true },
        ],
      }),
    ]);
    const diff = diffPluginRegistries(current, next);
    const report = validatePluginRegistryDiff(current, next, diff);
    expect(report.canApply).toBe(true); // warnings don't block
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(1);
    expect(report.issues[0]).toMatchObject({
      kind: "optional-dependency-missing",
      severity: "warning",
    });
  });
});

describe("validatePluginRegistryDiff — version-mismatch", () => {
  it("flags a present dep whose version doesn't satisfy the requested range", () => {
    const current = registry([
      plugin("com.dep", { version: "1.0.0" }),
      plugin("com.user", {
        dependencies: [{ id: "com.dep", versionRange: "^2.0.0" }],
      }),
    ]);
    const diff = diffPluginRegistries(current, current);
    const report = validatePluginRegistryDiff(current, current, diff);
    expect(report.canApply).toBe(false);
    expect(report.issues[0]).toMatchObject({
      kind: "version-mismatch",
      severity: "error",
      pluginId: "com.user",
      relatedPluginId: "com.dep",
      requiredRange: "^2.0.0",
      actualVersion: "1.0.0",
    });
  });

  it("downgrades to optional-version-mismatch (warning) for optional deps", () => {
    const current = registry([
      plugin("com.dep", { version: "1.0.0" }),
      plugin("com.user", {
        dependencies: [
          { id: "com.dep", versionRange: "^2.0.0", optional: true },
        ],
      }),
    ]);
    const diff = diffPluginRegistries(current, current);
    const report = validatePluginRegistryDiff(current, current, diff);
    expect(report.canApply).toBe(true);
    expect(report.issues[0]).toMatchObject({
      kind: "optional-version-mismatch",
      severity: "warning",
    });
  });
});

describe("validatePluginRegistryDiff — dropped-dependent", () => {
  it("flags removal of a plugin that another plugin still hard-depends on", () => {
    const current = registry([
      plugin("com.dep"),
      plugin("com.user", {
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
    ]);
    const next = registry([
      plugin("com.user", {
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
    ]);
    const diff = diffPluginRegistries(current, next);
    const report = validatePluginRegistryDiff(current, next, diff);
    expect(report.canApply).toBe(false);
    // Both dropped-dependent AND broken-dependency should fire — they
    // describe the same situation from the editor's two angles.
    expect(report.issues.map((i) => i.kind).sort()).toEqual([
      "broken-dependency",
      "dropped-dependent",
    ]);
  });

  it("does NOT flag dropped-dependent when the dependent is also being removed", () => {
    const current = registry([
      plugin("com.dep"),
      plugin("com.user", {
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
    ]);
    const next = registry([]); // remove both
    const diff = diffPluginRegistries(current, next);
    const report = validatePluginRegistryDiff(current, next, diff);
    expect(report.issues).toEqual([]);
    expect(report.canApply).toBe(true);
  });

  it("does NOT flag dropped-dependent for an optional dependent", () => {
    const current = registry([
      plugin("com.dep"),
      plugin("com.user", {
        dependencies: [
          { id: "com.dep", versionRange: "^1.0.0", optional: true },
        ],
      }),
    ]);
    const next = registry([
      plugin("com.user", {
        dependencies: [
          { id: "com.dep", versionRange: "^1.0.0", optional: true },
        ],
      }),
    ]);
    const diff = diffPluginRegistries(current, next);
    const report = validatePluginRegistryDiff(current, next, diff);
    expect(report.issues.map((i) => i.kind)).toEqual([
      "optional-dependency-missing",
    ]);
    expect(report.canApply).toBe(true);
  });
});

describe("validatePluginRegistryDiff — selection-aware projection", () => {
  it("validates against the projected registry, respecting an empty selection (skip remove)", () => {
    const current = registry([
      plugin("com.dep"),
      plugin("com.user", {
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
    ]);
    const next = registry([
      plugin("com.user", {
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
    ]);
    const diff = diffPluginRegistries(current, next);
    // User unchecks the remove → no breakage
    const report = validatePluginRegistryDiff(current, next, diff, {
      removed: new Set<string>(),
    });
    expect(report.issues).toEqual([]);
    expect(report.canApply).toBe(true);
  });
});

describe("validatePluginRegistryDiff — ordering", () => {
  it("sorts errors before warnings, then by pluginId asc", () => {
    const current = registry([]);
    const next = registry([
      plugin("com.zalpha", {
        dependencies: [
          { id: "com.optional", versionRange: "^1.0.0", optional: true },
        ],
      }),
      plugin("com.aalpha", {
        dependencies: [{ id: "com.required", versionRange: "^1.0.0" }],
      }),
    ]);
    const diff = diffPluginRegistries(current, next);
    const report = validatePluginRegistryDiff(current, next, diff);
    expect(report.issues.map((i) => `${i.severity}:${i.pluginId}`)).toEqual([
      "error:com.aalpha",
      "warning:com.zalpha",
    ]);
  });
});
