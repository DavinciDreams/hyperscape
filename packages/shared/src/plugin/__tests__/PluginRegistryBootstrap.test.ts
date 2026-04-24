import { PluginRegistryManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContextScope } from "../PluginContextScope.js";
import { type PluginContextBase } from "../PluginHost.js";
import {
  UnregisteredPluginError,
  createPluginHostFromRegistry,
} from "../PluginRegistryBootstrap.js";

interface TestCtx extends PluginContextBase {
  events: string[];
}

function plugin(id: string, deps: string[] = []) {
  return {
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    dependencies: deps.map((d) => ({ id: d, versionRange: "^1.0.0" })),
  };
}

describe("createPluginHostFromRegistry", () => {
  it("returns a host with empty registry — loadAll is a no-op", async () => {
    const registry = PluginRegistryManifestSchema.parse({});
    const events: string[] = [];
    const host = createPluginHostFromRegistry<TestCtx>({
      registry,
      buildContext: (_manifest, scope: PluginContextScope) => ({
        pluginId: _manifest.id,
        scope,
        events,
      }),
      factories: {},
    });
    await host.loadAll();
    expect(host.snapshot().loaded).toEqual([]);
  });

  it("registers supplied factories against the registry plugins", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [plugin("com.a.one"), plugin("com.a.two", ["com.a.one"])],
    });
    const events: string[] = [];
    const host = createPluginHostFromRegistry<TestCtx>({
      registry,
      buildContext: (m, scope) => ({ pluginId: m.id, scope, events }),
      factories: {
        "com.a.one": () => ({
          onLoad(ctx) {
            ctx.events.push(`${ctx.pluginId}:onLoad`);
          },
        }),
        "com.a.two": () => ({
          onLoad(ctx) {
            ctx.events.push(`${ctx.pluginId}:onLoad`);
          },
        }),
      },
    });
    await host.loadAll();
    expect(events).toEqual(["com.a.one:onLoad", "com.a.two:onLoad"]);
  });

  it("throws UnregisteredPluginError when a factory has no registry match", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [plugin("com.a.one")],
    });
    expect(() =>
      createPluginHostFromRegistry<TestCtx>({
        registry,
        buildContext: (m, scope) => ({ pluginId: m.id, scope, events: [] }),
        factories: {
          "com.a.ghost": () => ({}),
        },
      }),
    ).toThrow(UnregisteredPluginError);
  });

  it("UnregisteredPluginError lists known ids for diagnostics", () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [plugin("com.a.one"), plugin("com.a.two")],
    });
    try {
      createPluginHostFromRegistry<TestCtx>({
        registry,
        buildContext: (m, scope) => ({ pluginId: m.id, scope, events: [] }),
        factories: {
          "com.a.ghost": () => ({}),
        },
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnregisteredPluginError);
      expect((err as UnregisteredPluginError).pluginId).toBe("com.a.ghost");
      expect((err as Error).message).toContain("com.a.one");
      expect((err as Error).message).toContain("com.a.two");
    }
  });

  it("missing factory for registered plugin fails later at loadAll", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [plugin("com.a.one"), plugin("com.a.two")],
    });
    const host = createPluginHostFromRegistry<TestCtx>({
      registry,
      buildContext: (m, scope) => ({ pluginId: m.id, scope, events: [] }),
      factories: {
        "com.a.one": () => ({}),
        // com.a.two has no factory
      },
    });
    await expect(host.loadAll()).rejects.toThrow(/com\.a\.two/);
  });

  it("registered factories are already wrapped with scope.dispose", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [plugin("com.scope")],
    });
    const events: string[] = [];
    const host = createPluginHostFromRegistry<TestCtx>({
      registry,
      buildContext: (m, scope) => {
        const ctx: TestCtx = { pluginId: m.id, scope, events };
        return ctx;
      },
      factories: {
        "com.scope": () => ({
          onEnable(ctx) {
            ctx.scope.register(
              () => void ctx.events.push(`${ctx.pluginId}:disposed`),
            );
          },
        }),
      },
    });
    await host.loadAll();
    await host.enableAll();
    await host.disableAll();
    expect(events).toEqual(["com.scope:disposed"]);
  });
});
