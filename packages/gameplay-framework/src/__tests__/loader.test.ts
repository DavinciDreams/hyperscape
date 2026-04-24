/**
 * Tests for the dynamic plugin module loader.
 *
 * Two layers of coverage:
 *   1. Injected-importer unit tests — hermetic, don't touch the disk,
 *      cover every failure mode loudly.
 *   2. Real filesystem integration — loads the built
 *      `@hyperforge/plugin-hello-reference` via its on-disk path to
 *      prove the happy path actually works against `import()`.
 *
 * The integration test is gated on the reference plugin's `dist/`
 * existing. It's built by its own `bun run build` which the workspace
 * wiring ensures runs before dependent test commands. If `dist/` is
 * missing the test fails loudly — we treat a missing dist as a real
 * regression, not a skip condition.
 */

import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PluginFactoryResolutionError,
  PluginManifestSchema,
  PluginModuleImportError,
  loadPluginFromManifest,
  type PluginManifest,
} from "../index.js";

/** Minimal valid manifest fixture — reused across tests. */
function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return PluginManifestSchema.parse({
    id: "com.example.hello",
    name: "Hello",
    version: "0.1.0",
    entry: "./dist/index.js",
    author: { name: "example" },
    hyperforgeApi: "0.1.0",
    ...overrides,
  });
}

describe("loadPluginFromManifest — injected importer", () => {
  it("returns the default export when it is a function", async () => {
    const factoryStub = () => ({ onEnable: () => {} });
    const { manifest, factory } = await loadPluginFromManifest(makeManifest(), {
      baseDir: "/fake/plugin/root",
      importer: async () => ({ default: factoryStub }),
    });
    expect(manifest.id).toBe("com.example.hello");
    expect(factory).toBe(factoryStub);
  });

  it("can pick up a named export via factoryExport option", async () => {
    const named = () => ({});
    const { factory } = await loadPluginFromManifest(makeManifest(), {
      baseDir: "/fake/plugin/root",
      factoryExport: "pluginFactory",
      importer: async () => ({ pluginFactory: named, default: 42 }),
    });
    expect(factory).toBe(named);
  });

  it("throws PluginFactoryResolutionError when the export is missing", async () => {
    await expect(
      loadPluginFromManifest(makeManifest({ id: "com.example.missing" }), {
        baseDir: "/fake/plugin/root",
        importer: async () => ({ somethingElse: () => {} }),
      }),
    ).rejects.toBeInstanceOf(PluginFactoryResolutionError);
  });

  it("throws PluginFactoryResolutionError when the export isn't a function", async () => {
    await expect(
      loadPluginFromManifest(makeManifest({ id: "com.example.bad-shape" }), {
        baseDir: "/fake/plugin/root",
        importer: async () => ({ default: "not-a-function" }),
      }),
    ).rejects.toThrow(/is not a function/);
  });

  it("throws PluginFactoryResolutionError when the module isn't an object", async () => {
    await expect(
      loadPluginFromManifest(makeManifest({ id: "com.example.primitive" }), {
        baseDir: "/fake/plugin/root",
        importer: async () => "i'm a string, not a module",
      }),
    ).rejects.toThrow(/module did not resolve to an object/);
  });

  it("wraps import() failures in PluginModuleImportError with plugin id + specifier", async () => {
    const boom = new Error("ENOENT: file not found");
    let caught: unknown;
    try {
      await loadPluginFromManifest(makeManifest({ id: "com.example.broken" }), {
        baseDir: "/fake/plugin/root",
        importer: async () => {
          throw boom;
        },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PluginModuleImportError);
    const asImportErr = caught as PluginModuleImportError;
    expect(asImportErr.pluginId).toBe("com.example.broken");
    expect(asImportErr.specifier).toMatch(/^file:\/\//);
    expect(asImportErr.cause).toBe(boom);
  });

  it("resolves manifest.entry against baseDir as a file:// URL", async () => {
    let seenSpecifier = "";
    await loadPluginFromManifest(makeManifest({ entry: "./dist/main.js" }), {
      baseDir: "/abs/plugin/root",
      importer: async (spec: string) => {
        seenSpecifier = spec;
        return { default: () => ({}) };
      },
    });
    expect(seenSpecifier).toMatch(/^file:\/\//);
    expect(seenSpecifier).toMatch(/\/abs\/plugin\/root\/dist\/main\.js$/);
  });
});

describe("loadPluginFromManifest — real filesystem integration", () => {
  // Locate the sibling plugin-hello-reference package from this test
  // file's on-disk location. This keeps the integration hermetic even
  // if someone runs vitest from a different cwd.
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const helloPluginRoot = path.resolve(
    thisDir,
    "../../../plugin-hello-reference",
  );

  it("loads the built @hyperforge/plugin-hello-reference package end-to-end", async () => {
    // Import the manifest fixture directly — avoids repeating the JSON.
    const helloManifestModule = (await import(
      path.join(helloPluginRoot, "plugin.json"),
      { with: { type: "json" } }
    )) as { default: unknown };
    const manifest = PluginManifestSchema.parse(helloManifestModule.default);

    const { factory } = await loadPluginFromManifest(manifest, {
      baseDir: helloPluginRoot,
    });

    // We got a factory — invoke it to confirm it matches PluginFactory
    // shape. The factory exported from plugin-hello-reference is the
    // default `helloReferencePluginFactory` which is a curried
    // (name, text) => () => plugin — so calling it once yields another
    // factory. We don't drive the full lifecycle here; that's already
    // covered inside the hello-reference package's own test suite.
    expect(typeof factory).toBe("function");
  });
});
