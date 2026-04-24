import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContextScope } from "../PluginContextScope.js";
import { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import {
  type PaletteCategory,
  type PaletteContributionContext,
  paletteContributionPlugin,
} from "../examples/PaletteContributionPlugin.js";
import { createPluginHostFromRegistry } from "../PluginRegistryBootstrap.js";

function manifestFor(id: string): PluginManifest {
  return {
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    dependencies: [],
  } as PluginManifest;
}

function mkPaletteRegistry() {
  return new PluginContributionRegistry<PaletteCategory>(
    (c) => c.id,
    "paletteCategory",
  );
}

describe("PaletteContributionPlugin (I4 reference integration)", () => {
  it("registers palette categories on enable and retracts them on disable", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [manifestFor("com.reference.palette")],
    });
    const paletteCategories = mkPaletteRegistry();

    const host = createPluginHostFromRegistry<PaletteContributionContext>({
      registry,
      buildContext: (manifest, scope: PluginContextScope) => ({
        pluginId: manifest.id,
        scope,
        paletteCategories,
      }),
      factories: {
        "com.reference.palette": () =>
          paletteContributionPlugin([
            { id: "cat.buildings", label: "Buildings" },
            { id: "cat.props", label: "Props" },
          ]),
      },
    });

    await host.loadAll();
    // Load phase should not touch the registry.
    expect(paletteCategories.size).toBe(0);

    await host.enableAll();
    expect(paletteCategories.size).toBe(2);
    expect(paletteCategories.idsForPlugin("com.reference.palette")).toEqual([
      "cat.buildings",
      "cat.props",
    ]);
    expect(paletteCategories.get("cat.buildings").label).toBe("Buildings");

    await host.disableAll();
    expect(paletteCategories.size).toBe(0);
    expect(paletteCategories.idsForPlugin("com.reference.palette")).toEqual([]);
  });

  it("re-enabling after disable contributes the same categories again (fresh scope)", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [manifestFor("com.reference.palette")],
    });
    const paletteCategories = mkPaletteRegistry();

    const host = createPluginHostFromRegistry<PaletteContributionContext>({
      registry,
      buildContext: (manifest, scope) => ({
        pluginId: manifest.id,
        scope,
        paletteCategories,
      }),
      factories: {
        "com.reference.palette": () =>
          paletteContributionPlugin([
            { id: "cat.buildings", label: "Buildings" },
          ]),
      },
    });

    await host.loadAndEnable();
    expect(paletteCategories.size).toBe(1);

    await host.disableAll();
    expect(paletteCategories.size).toBe(0);

    await host.enableAll();
    expect(paletteCategories.size).toBe(1);
    expect(paletteCategories.get("cat.buildings").label).toBe("Buildings");

    await host.disableAll();
    expect(paletteCategories.size).toBe(0);
  });

  it("two plugins can contribute distinct categories side-by-side", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        manifestFor("com.reference.palette.a"),
        manifestFor("com.reference.palette.b"),
      ],
    });
    const paletteCategories = mkPaletteRegistry();

    const host = createPluginHostFromRegistry<PaletteContributionContext>({
      registry,
      buildContext: (manifest, scope) => ({
        pluginId: manifest.id,
        scope,
        paletteCategories,
      }),
      factories: {
        "com.reference.palette.a": () =>
          paletteContributionPlugin([
            { id: "cat.a.one", label: "A-1" },
            { id: "cat.a.two", label: "A-2" },
          ]),
        "com.reference.palette.b": () =>
          paletteContributionPlugin([{ id: "cat.b.one", label: "B-1" }]),
      },
    });

    await host.loadAndEnable();
    expect(paletteCategories.size).toBe(3);
    expect(paletteCategories.idsForPlugin("com.reference.palette.a")).toEqual([
      "cat.a.one",
      "cat.a.two",
    ]);
    expect(paletteCategories.idsForPlugin("com.reference.palette.b")).toEqual([
      "cat.b.one",
    ]);

    // Disabling plugin A leaves B's categories intact.
    await host.disableAll();
    expect(paletteCategories.size).toBe(0);
  });
});
