import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import {
  type HudWidget,
  type WidgetContributionContext,
  widgetContributionPlugin,
  InvalidWidgetAnchorError,
  InvalidWidgetZOrderError,
} from "../examples/WidgetContributionPlugin.js";
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

function mkWidgetRegistry() {
  return new PluginContributionRegistry<HudWidget>((w) => w.id, "widget");
}

async function runWithWidgets(widgets: readonly HudWidget[]) {
  const registry = PluginRegistryManifestSchema.parse({
    plugins: [manifestFor("com.reference.widgets")],
  });
  const widgetsReg = mkWidgetRegistry();
  const host = createPluginHostFromRegistry<WidgetContributionContext>({
    registry,
    buildContext: (manifest, scope) => ({
      pluginId: manifest.id,
      scope,
      widgets: widgetsReg,
    }),
    factories: {
      "com.reference.widgets": () => widgetContributionPlugin(widgets),
    },
  });
  return { host, widgetsReg };
}

describe("WidgetContributionPlugin (I4 reference integration)", () => {
  it("registers widgets on enable and retracts them on disable", async () => {
    const { host, widgetsReg } = await runWithWidgets([
      { id: "w.minimap", label: "Minimap", anchor: "top-right", zOrder: 10 },
      { id: "w.hotbar", label: "Hotbar", anchor: "bottom-center", zOrder: 5 },
    ]);

    await host.loadAndEnable();
    expect(widgetsReg.size).toBe(2);
    expect(widgetsReg.idsForPlugin("com.reference.widgets")).toEqual([
      "w.minimap",
      "w.hotbar",
    ]);
    expect(widgetsReg.get("w.minimap").anchor).toBe("top-right");

    await host.disableAll();
    expect(widgetsReg.size).toBe(0);
  });

  it("accepts zOrder = 0", async () => {
    const { host, widgetsReg } = await runWithWidgets([
      { id: "w.bg", label: "Background", anchor: "center", zOrder: 0 },
    ]);
    await host.loadAndEnable();
    expect(widgetsReg.get("w.bg").zOrder).toBe(0);
  });

  it("rejects invalid anchors", async () => {
    const { host } = await runWithWidgets([
      // @ts-expect-error — testing runtime validation
      { id: "w.bad", label: "Bad", anchor: "middle-right", zOrder: 1 },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidWidgetAnchorError),
    });
  });

  it("rejects negative zOrder", async () => {
    const { host } = await runWithWidgets([
      { id: "w.bad", label: "Bad", anchor: "top-left", zOrder: -1 },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidWidgetZOrderError),
    });
  });

  it("rejects non-finite zOrder (NaN / Infinity)", async () => {
    const { host } = await runWithWidgets([
      { id: "w.bad", label: "Bad", anchor: "top-left", zOrder: NaN },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidWidgetZOrderError),
    });
  });
});
