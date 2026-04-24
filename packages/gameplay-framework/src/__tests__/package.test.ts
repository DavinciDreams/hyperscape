/**
 * Tests for the one-call plugin package loader.
 *
 * Two layers:
 *   1. Injected-loader unit tests — hermetic, stub the manifest
 *      reader and the dynamic importer. Cover each typed error class
 *      independently.
 *   2. Real-filesystem integration — `loadPluginPackage(helloRoot)`
 *      resolves the built `@hyperforge/plugin-hello-reference` and
 *      returns a working factory.
 */

import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PluginApiIncompatibleError,
  PluginManifestReadError,
  PluginManifestValidationError,
  loadPluginPackage,
} from "../index.js";

/** Baseline valid raw manifest — tests clone + mutate as needed. */
function validRawManifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "com.example.hello",
    name: "Hello",
    version: "0.1.0",
    entry: "./dist/index.js",
    author: { name: "example" },
    hyperforgeApi: "0.1.0",
    ...overrides,
  };
}

describe("loadPluginPackage — injected readers", () => {
  it("happy path: returns { manifest, factory } when all stages succeed", async () => {
    const factoryStub = () => ({});
    const { manifest, factory } = await loadPluginPackage("/fake/plugin/root", {
      manifestLoader: async () => validRawManifest(),
      importer: async () => ({ default: factoryStub }),
    });
    expect(manifest.id).toBe("com.example.hello");
    expect(factory).toBe(factoryStub);
  });

  it("wraps manifest-read I/O errors in PluginManifestReadError", async () => {
    const ioError = new Error("ENOENT: no such file");
    let caught: unknown;
    try {
      await loadPluginPackage("/fake/plugin/root", {
        manifestLoader: async () => {
          throw ioError;
        },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PluginManifestReadError);
    const asReadErr = caught as PluginManifestReadError;
    expect(asReadErr.manifestPath).toMatch(/plugin\.json$/);
    expect(asReadErr.cause).toBe(ioError);
  });

  it("wraps schema-validation errors in PluginManifestValidationError", async () => {
    await expect(
      loadPluginPackage("/fake/plugin/root", {
        manifestLoader: async () =>
          validRawManifest({ id: "NOT-LOWERCASE.dotted" }),
      }),
    ).rejects.toBeInstanceOf(PluginManifestValidationError);
  });

  it("throws PluginApiIncompatibleError when hyperforgeApi falls outside hostApiRange", async () => {
    let caught: unknown;
    try {
      await loadPluginPackage("/fake/plugin/root", {
        manifestLoader: async () =>
          validRawManifest({ hyperforgeApi: "2.0.0" }),
        hostApiRange: "^0.1.0",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PluginApiIncompatibleError);
    const asApiErr = caught as PluginApiIncompatibleError;
    expect(asApiErr.pluginId).toBe("com.example.hello");
    expect(asApiErr.pluginApiVersion).toBe("2.0.0");
    expect(asApiErr.hostApiRange).toBe("^0.1.0");
  });

  it("admits plugins whose hyperforgeApi satisfies hostApiRange", async () => {
    const factoryStub = () => ({});
    const { factory } = await loadPluginPackage("/fake/plugin/root", {
      manifestLoader: async () => validRawManifest({ hyperforgeApi: "0.1.5" }),
      hostApiRange: "^0.1.0",
      importer: async () => ({ default: factoryStub }),
    });
    expect(factory).toBe(factoryStub);
  });

  it("treats hostApiRange='*' as skip-check", async () => {
    const factoryStub = () => ({});
    // "2.0.0" would fail any non-wildcard range, but "*" skips.
    const { factory } = await loadPluginPackage("/fake/plugin/root", {
      manifestLoader: async () => validRawManifest({ hyperforgeApi: "2.0.0" }),
      hostApiRange: "*",
      importer: async () => ({ default: factoryStub }),
    });
    expect(factory).toBe(factoryStub);
  });

  it("honors manifestFilename override", async () => {
    let readPath = "";
    await loadPluginPackage("/fake/plugin/root", {
      manifestFilename: "hyperforge.plugin.json",
      manifestLoader: async (p: string) => {
        readPath = p;
        return validRawManifest();
      },
      importer: async () => ({ default: () => ({}) }),
    });
    expect(readPath).toMatch(/hyperforge\.plugin\.json$/);
  });

  it("passes factoryExport through to the underlying loader", async () => {
    const namedFactory = () => ({});
    const { factory } = await loadPluginPackage("/fake/plugin/root", {
      manifestLoader: async () => validRawManifest(),
      factoryExport: "pluginFactory",
      importer: async () => ({
        default: 42,
        pluginFactory: namedFactory,
      }),
    });
    expect(factory).toBe(namedFactory);
  });
});

describe("loadPluginPackage — real filesystem integration", () => {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const helloPluginRoot = path.resolve(
    thisDir,
    "../../../plugin-hello-reference",
  );

  it("loads @hyperforge/plugin-hello-reference end-to-end from its package root", async () => {
    const { manifest, factory } = await loadPluginPackage(helloPluginRoot, {
      hostApiRange: "^0.1.0",
    });
    expect(manifest.id).toBe("com.hyperforge.plugin-hello-reference");
    expect(typeof factory).toBe("function");
    const plugin = factory();
    expect(typeof plugin.onEnable).toBe("function");
  });
});
