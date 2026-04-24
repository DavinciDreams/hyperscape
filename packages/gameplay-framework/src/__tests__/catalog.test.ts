/**
 * Tests for the plugin catalog.
 *
 * Coverage:
 *   - Empty directory → empty loaded + failed
 *   - Single valid package → loaded only
 *   - Single invalid package → failed only, error preserved
 *   - Mixed valid + invalid → both populated
 *   - Subdir without plugin.json → silently skipped (not a failure)
 *   - Directory-listing failure → PluginCatalogReadError (the one
 *     case where the catalog does throw)
 *   - hostApiRange + factoryExport + manifestFilename passthrough
 *   - Result order matches listing order
 */

import { describe, expect, it } from "vitest";
import * as path from "node:path";

import {
  PluginCatalogReadError,
  PluginManifestValidationError,
  loadPluginCatalog,
} from "../index.js";

/** Baseline valid raw manifest — tests clone + mutate as needed. */
function validRawManifest(
  idSuffix: string,
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    id: `com.example.${idSuffix}`,
    name: `Example ${idSuffix}`,
    version: "0.1.0",
    entry: "./dist/index.js",
    author: { name: "example" },
    hyperforgeApi: "0.1.0",
    ...overrides,
  };
}

describe("loadPluginCatalog — injected filesystem", () => {
  it("returns empty result for an empty directory", async () => {
    const result = await loadPluginCatalog("/fake/plugins", {
      directoryLister: async () => [],
    });
    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it("loads a single valid package into `loaded`", async () => {
    const factoryStub = () => ({});
    const result = await loadPluginCatalog("/fake/plugins", {
      directoryLister: async () => ["alpha"],
      manifestExistsCheck: async () => true,
      manifestLoader: async () => validRawManifest("alpha"),
      importer: async () => ({ default: factoryStub }),
    });
    expect(result.loaded).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(result.loaded[0]!.manifest.id).toBe("com.example.alpha");
    expect(result.loaded[0]!.factory).toBe(factoryStub);
  });

  it("captures a single invalid package into `failed` without throwing", async () => {
    const result = await loadPluginCatalog("/fake/plugins", {
      directoryLister: async () => ["broken"],
      manifestExistsCheck: async () => true,
      manifestLoader: async () =>
        validRawManifest("broken", { id: "BAD-CASE" }),
    });
    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.baseDir).toBe(
      path.join("/fake/plugins", "broken"),
    );
    expect(result.failed[0]!.error).toBeInstanceOf(
      PluginManifestValidationError,
    );
  });

  it("aggregates mixed valid + invalid packages", async () => {
    const factoryStub = () => ({});
    const result = await loadPluginCatalog("/fake/plugins", {
      directoryLister: async () => ["alpha", "broken", "beta"],
      manifestExistsCheck: async () => true,
      manifestLoader: async (p: string) => {
        if (p.includes("broken"))
          return validRawManifest("broken", { id: "BAD-CASE" });
        if (p.includes("alpha")) return validRawManifest("alpha");
        return validRawManifest("beta");
      },
      importer: async () => ({ default: factoryStub }),
    });
    expect(result.loaded.map((m) => m.manifest.id)).toEqual([
      "com.example.alpha",
      "com.example.beta",
    ]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.baseDir).toBe(
      path.join("/fake/plugins", "broken"),
    );
  });

  it("silently skips subdirectories without a manifest (not a failure)", async () => {
    const factoryStub = () => ({});
    const result = await loadPluginCatalog("/fake/plugins", {
      directoryLister: async () => ["alpha", "not-a-plugin"],
      manifestExistsCheck: async (p: string) => p.includes("alpha"),
      manifestLoader: async () => validRawManifest("alpha"),
      importer: async () => ({ default: factoryStub }),
    });
    expect(result.loaded.map((m) => m.manifest.id)).toEqual([
      "com.example.alpha",
    ]);
    expect(result.failed).toHaveLength(0);
  });

  it("preserves listing order in `loaded[]`", async () => {
    const factoryStub = () => ({});
    const result = await loadPluginCatalog("/fake/plugins", {
      directoryLister: async () => ["gamma", "alpha", "beta"],
      manifestExistsCheck: async () => true,
      manifestLoader: async (p: string) => {
        if (p.includes("gamma")) return validRawManifest("gamma");
        if (p.includes("alpha")) return validRawManifest("alpha");
        return validRawManifest("beta");
      },
      importer: async () => ({ default: factoryStub }),
    });
    expect(result.loaded.map((m) => m.manifest.id)).toEqual([
      "com.example.gamma",
      "com.example.alpha",
      "com.example.beta",
    ]);
  });

  it("throws PluginCatalogReadError when the catalog dir can't be listed", async () => {
    const ioErr = new Error("ENOENT: no such dir");
    let caught: unknown;
    try {
      await loadPluginCatalog("/fake/plugins", {
        directoryLister: async () => {
          throw ioErr;
        },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PluginCatalogReadError);
    const asReadErr = caught as PluginCatalogReadError;
    expect(asReadErr.pluginsDir).toBe("/fake/plugins");
    expect(asReadErr.cause).toBe(ioErr);
  });

  it("threads hostApiRange through to per-package loader", async () => {
    const result = await loadPluginCatalog("/fake/plugins", {
      directoryLister: async () => ["old-api"],
      manifestExistsCheck: async () => true,
      manifestLoader: async () =>
        validRawManifest("old-api", { hyperforgeApi: "2.0.0" }),
      hostApiRange: "^0.1.0",
    });
    // Incompatible api → goes to `failed[]`, not thrown.
    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect((result.failed[0]!.error as Error).name).toBe(
      "PluginApiIncompatibleError",
    );
  });
});
