import { PluginManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginCatalog } from "../PluginCatalog.js";
import { PluginContextScope } from "../PluginContextScope.js";
import { type PluginContextBase, PluginHost } from "../PluginHost.js";

function manifest(id: string, deps: string[] = []) {
  return PluginManifestSchema.parse({
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    dependencies: deps.map((d) => ({ id: d, versionRange: "^1.0.0" })),
  });
}

interface TestCtx extends PluginContextBase {
  track(label: string): void;
  readonly events: string[];
}

describe("PluginHost", () => {
  it("load → enable → disable drives lifecycle end-to-end with auto scope dispose", async () => {
    const events: string[] = [];
    const catalog = new PluginCatalog([
      manifest("com.h.one"),
      manifest("com.h.two", ["com.h.one"]),
    ]);
    const host = new PluginHost<TestCtx>(
      catalog,
      (manifestArg, scope: PluginContextScope) => {
        const ctx: TestCtx = {
          pluginId: manifestArg.id,
          scope,
          events,
          track(label: string) {
            events.push(`${manifestArg.id}:${label}`);
            scope.register(
              () => void events.push(`${manifestArg.id}:${label}-disposed`),
            );
          },
        };
        return ctx;
      },
    );
    host.registerPlugin("com.h.one", () => ({
      onLoad(ctx) {
        ctx.events.push(`${ctx.pluginId}:onLoad`);
      },
      onEnable(ctx) {
        ctx.track("a");
      },
    }));
    host.registerPlugin("com.h.two", () => ({
      onEnable(ctx) {
        ctx.track("b");
      },
      onDisable(ctx) {
        ctx.events.push(`${ctx.pluginId}:user-onDisable`);
      },
    }));
    await host.loadAll();
    await host.enableAll();
    await host.disableAll();
    expect(events).toEqual([
      "com.h.one:onLoad",
      "com.h.one:a",
      "com.h.two:b",
      // disable is reverse-topo, so two goes first
      "com.h.two:user-onDisable",
      "com.h.two:b-disposed",
      "com.h.one:a-disposed",
    ]);
  });

  it("records and getRecord reflect state transitions", async () => {
    const catalog = new PluginCatalog([manifest("com.h.solo")]);
    const host = new PluginHost<TestCtx>(catalog, (m, scope) => ({
      pluginId: m.id,
      scope,
      events: [],
      track() {},
    }));
    host.registerPlugin("com.h.solo", () => ({}));
    expect(host.getRecord("com.h.solo").state).toBe("registered");
    await host.loadAll();
    expect(host.getRecord("com.h.solo").state).toBe("loaded");
    await host.enableAll();
    expect(host.getRecord("com.h.solo").state).toBe("enabled");
    await host.disableAll();
    expect(host.getRecord("com.h.solo").state).toBe("disabled");
    expect(host.records.map((r) => r.state)).toEqual(["disabled"]);
  });

  it("auto scope.dispose fires even when user plugin omits onDisable", async () => {
    const seen: string[] = [];
    const catalog = new PluginCatalog([manifest("com.h.only-enable")]);
    const host = new PluginHost<TestCtx>(catalog, (m, scope) => ({
      pluginId: m.id,
      scope,
      events: seen,
      track(label: string) {
        seen.push(`${m.id}:${label}`);
        scope.register(() => void seen.push(`${m.id}:${label}-disposed`));
      },
    }));
    host.registerPlugin("com.h.only-enable", () => ({
      onEnable(ctx) {
        ctx.track("x");
      },
    }));
    await host.loadAll();
    await host.enableAll();
    await host.disableAll();
    expect(seen).toEqual([
      "com.h.only-enable:x",
      "com.h.only-enable:x-disposed",
    ]);
  });

  it("scope drain happens even if user onDisable throws", async () => {
    const seen: string[] = [];
    const catalog = new PluginCatalog([manifest("com.h.flaky-disable")]);
    const host = new PluginHost<TestCtx>(catalog, (m, scope) => ({
      pluginId: m.id,
      scope,
      events: seen,
      track(label: string) {
        seen.push(`${m.id}:${label}`);
        scope.register(() => void seen.push(`${m.id}:${label}-disposed`));
      },
    }));
    host.registerPlugin("com.h.flaky-disable", () => ({
      onEnable(ctx) {
        ctx.track("y");
      },
      onDisable() {
        throw new Error("user-onDisable boom");
      },
    }));
    await host.loadAll();
    await host.enableAll();
    await expect(host.disableAll()).rejects.toThrow("user-onDisable boom");
    // scope disposer still ran because wrapper's try/finally drains it
    expect(seen).toEqual([
      "com.h.flaky-disable:y",
      "com.h.flaky-disable:y-disposed",
    ]);
  });

  it("hasPlugin reports factory registration state", () => {
    const catalog = new PluginCatalog([manifest("com.h.solo")]);
    const host = new PluginHost<TestCtx>(catalog, (m, scope) => ({
      pluginId: m.id,
      scope,
      events: [],
      track() {},
    }));
    expect(host.hasPlugin("com.h.solo")).toBe(false);
    host.registerPlugin("com.h.solo", () => ({}));
    expect(host.hasPlugin("com.h.solo")).toBe(true);
  });

  it("exposes underlying loader + catalog for advanced callers", () => {
    const catalog = new PluginCatalog([manifest("com.h.solo")]);
    const host = new PluginHost<TestCtx>(catalog, (m, scope) => ({
      pluginId: m.id,
      scope,
      events: [],
      track() {},
    }));
    expect(host.catalog).toBe(catalog);
    expect(host.loader.catalog).toBe(catalog);
  });

  it("loadAndEnable convenience runs loadAll then enableAll in sequence", async () => {
    const events: string[] = [];
    const catalog = new PluginCatalog([manifest("com.h.seq")]);
    const host = new PluginHost<TestCtx>(catalog, (m, scope) => ({
      pluginId: m.id,
      scope,
      events,
      track() {},
    }));
    host.registerPlugin("com.h.seq", () => ({
      onLoad(ctx) {
        ctx.events.push("L");
      },
      onEnable(ctx) {
        ctx.events.push("E");
      },
    }));
    await host.loadAndEnable();
    expect(events).toEqual(["L", "E"]);
    expect(host.getRecord("com.h.seq").state).toBe("enabled");
  });

  it("destroy is an alias for disableAll", async () => {
    const events: string[] = [];
    const catalog = new PluginCatalog([manifest("com.h.shutdown")]);
    const host = new PluginHost<TestCtx>(catalog, (m, scope) => ({
      pluginId: m.id,
      scope,
      events,
      track() {},
    }));
    host.registerPlugin("com.h.shutdown", () => ({
      onDisable(ctx) {
        ctx.events.push("bye");
      },
    }));
    await host.loadAndEnable();
    await host.destroy();
    expect(events).toEqual(["bye"]);
    expect(host.getRecord("com.h.shutdown").state).toBe("disabled");
  });

  it("snapshot groups plugin ids by lifecycle state", async () => {
    const catalog = new PluginCatalog([
      manifest("com.h.a"),
      manifest("com.h.b"),
    ]);
    const host = new PluginHost<TestCtx>(catalog, (m, scope) => ({
      pluginId: m.id,
      scope,
      events: [],
      track() {},
    }));
    host.registerPlugin("com.h.a", () => ({}));
    host.registerPlugin("com.h.b", () => ({}));
    expect(host.snapshot()).toEqual({
      registered: ["com.h.a", "com.h.b"],
      loaded: [],
      enabled: [],
      disabled: [],
      failed: [],
    });
    await host.loadAll();
    expect(host.snapshot().loaded.sort()).toEqual(["com.h.a", "com.h.b"]);
    await host.enableAll();
    expect(host.snapshot().enabled.sort()).toEqual(["com.h.a", "com.h.b"]);
    await host.disableAll();
    expect(host.snapshot().disabled.sort()).toEqual(["com.h.a", "com.h.b"]);
  });
});
