import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import {
  type ToolbarTool,
  type ToolbarToolContributionContext,
  toolbarToolContributionPlugin,
} from "../examples/ToolbarToolContributionPlugin.js";
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

function mkToolbarRegistry() {
  return new PluginContributionRegistry<ToolbarTool>(
    (t) => t.id,
    "toolbarTool",
  );
}

describe("ToolbarToolContributionPlugin (I4 reference integration)", () => {
  it("registers tools on enable and retracts them on disable", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [manifestFor("com.reference.toolbar")],
    });
    const toolbarTools = mkToolbarRegistry();

    const host = createPluginHostFromRegistry<ToolbarToolContributionContext>({
      registry,
      buildContext: (manifest, scope) => ({
        pluginId: manifest.id,
        scope,
        toolbarTools,
      }),
      factories: {
        "com.reference.toolbar": () =>
          toolbarToolContributionPlugin([
            {
              id: "tool.select",
              label: "Select",
              iconId: "cursor",
              group: "edit",
            },
            {
              id: "tool.move",
              label: "Move",
              iconId: "move",
              group: "edit",
            },
          ]),
      },
    });

    await host.loadAndEnable();
    expect(toolbarTools.size).toBe(2);
    expect(toolbarTools.idsForPlugin("com.reference.toolbar")).toEqual([
      "tool.select",
      "tool.move",
    ]);
    expect(toolbarTools.get("tool.move").group).toBe("edit");

    await host.disableAll();
    expect(toolbarTools.size).toBe(0);
  });

  it("two plugins can contribute side-by-side without colliding", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        manifestFor("com.reference.toolbar.a"),
        manifestFor("com.reference.toolbar.b"),
      ],
    });
    const toolbarTools = mkToolbarRegistry();

    const host = createPluginHostFromRegistry<ToolbarToolContributionContext>({
      registry,
      buildContext: (manifest, scope) => ({
        pluginId: manifest.id,
        scope,
        toolbarTools,
      }),
      factories: {
        "com.reference.toolbar.a": () =>
          toolbarToolContributionPlugin([
            {
              id: "tool.a.one",
              label: "A1",
              iconId: "a",
              group: "edit",
            },
          ]),
        "com.reference.toolbar.b": () =>
          toolbarToolContributionPlugin([
            {
              id: "tool.b.one",
              label: "B1",
              iconId: "b",
              group: "view",
            },
            {
              id: "tool.b.two",
              label: "B2",
              iconId: "b",
              group: "view",
            },
          ]),
      },
    });

    await host.loadAndEnable();
    expect(toolbarTools.size).toBe(3);
    expect(toolbarTools.idsForPlugin("com.reference.toolbar.a")).toEqual([
      "tool.a.one",
    ]);
    expect(toolbarTools.idsForPlugin("com.reference.toolbar.b")).toEqual([
      "tool.b.one",
      "tool.b.two",
    ]);
  });
});
