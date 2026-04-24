import { PluginManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import { PluginCatalog } from "../PluginCatalog.js";
import {
  type HyperforgePlugin,
  MissingHardDependencyError,
  MissingPluginFactoryError,
  PluginLifecycleError,
  PluginLoader,
} from "../PluginLoader.js";

function plugin(
  id: string,
  deps: { id: string; optional?: boolean }[] = [],
  loadAfter: string[] = [],
) {
  return PluginManifestSchema.parse({
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    dependencies: deps.map((d) => ({
      id: d.id,
      versionRange: "^1.0.0",
      optional: d.optional ?? false,
    })),
    loadAfter,
  });
}

function fakePlugin(hooks: Partial<HyperforgePlugin> = {}): HyperforgePlugin {
  return hooks;
}

describe("PluginLoader", () => {
  it("initializes records in `registered` state for every catalog plugin", () => {
    const cat = new PluginCatalog([plugin("com.a.one"), plugin("com.a.two")]);
    const loader = new PluginLoader(cat);
    expect(loader.records.map((r) => r.state).sort()).toEqual([
      "registered",
      "registered",
    ]);
    expect(loader.getRecord("com.a.one").instance).toBeNull();
  });

  it("registerFactory rejects ids not in catalog", () => {
    const cat = new PluginCatalog([plugin("com.a.one")]);
    const loader = new PluginLoader(cat);
    expect(() =>
      loader.registerFactory("com.a.ghost", () => fakePlugin()),
    ).toThrow();
  });

  it("loadAll throws MissingPluginFactoryError before any side effect", async () => {
    const cat = new PluginCatalog([plugin("com.a.one"), plugin("com.a.two")]);
    const loader = new PluginLoader(cat);
    const factoryTwo = vi.fn(() => fakePlugin());
    loader.registerFactory("com.a.two", factoryTwo);
    // com.a.one has no factory
    await expect(loader.loadAll()).rejects.toThrow(MissingPluginFactoryError);
    expect(factoryTwo).not.toHaveBeenCalled();
  });

  it("loadAll throws MissingHardDependencyError when a hard dep is absent", async () => {
    const cat = new PluginCatalog([
      plugin("com.a.one", [{ id: "com.a.missing" }]),
    ]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a.one", () => fakePlugin());
    await expect(loader.loadAll()).rejects.toThrow(MissingHardDependencyError);
  });

  it("loadAll instantiates factories and calls onLoad in dep order", async () => {
    const order: string[] = [];
    const cat = new PluginCatalog([
      plugin("com.a.leaf"),
      plugin("com.a.mid", [{ id: "com.a.leaf" }]),
      plugin("com.a.top", [{ id: "com.a.mid" }]),
    ]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a.leaf", () =>
      fakePlugin({ onLoad: () => void order.push("leaf:load") }),
    );
    loader.registerFactory("com.a.mid", () =>
      fakePlugin({ onLoad: () => void order.push("mid:load") }),
    );
    loader.registerFactory("com.a.top", () =>
      fakePlugin({ onLoad: () => void order.push("top:load") }),
    );
    await loader.loadAll();
    expect(order).toEqual(["leaf:load", "mid:load", "top:load"]);
    expect(loader.records.map((r) => [r.manifest.id, r.state]).sort()).toEqual([
      ["com.a.leaf", "loaded"],
      ["com.a.mid", "loaded"],
      ["com.a.top", "loaded"],
    ]);
  });

  it("loadAll awaits async onLoad hooks", async () => {
    const calls: string[] = [];
    const cat = new PluginCatalog([plugin("com.a.one")]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a.one", () =>
      fakePlugin({
        onLoad: async () => {
          await new Promise((r) => setTimeout(r, 1));
          calls.push("done");
        },
      }),
    );
    await loader.loadAll();
    expect(calls).toEqual(["done"]);
  });

  it("loadAll promotes plugin to `failed` when onLoad throws, surfaces PluginLifecycleError", async () => {
    const cat = new PluginCatalog([plugin("com.a.one")]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a.one", () =>
      fakePlugin({
        onLoad: () => {
          throw new Error("boom");
        },
      }),
    );
    await expect(loader.loadAll()).rejects.toThrow(PluginLifecycleError);
    const rec = loader.getRecord("com.a.one");
    expect(rec.state).toBe("failed");
    expect(rec.error?.message).toBe("boom");
  });

  it("loadAll stops at first failure (dependents skipped)", async () => {
    const order: string[] = [];
    const cat = new PluginCatalog([
      plugin("com.a.leaf"),
      plugin("com.a.top", [{ id: "com.a.leaf" }]),
    ]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a.leaf", () =>
      fakePlugin({
        onLoad: () => {
          order.push("leaf");
          throw new Error("leaf failed");
        },
      }),
    );
    loader.registerFactory("com.a.top", () =>
      fakePlugin({ onLoad: () => void order.push("top") }),
    );
    await expect(loader.loadAll()).rejects.toThrow(PluginLifecycleError);
    expect(order).toEqual(["leaf"]);
    expect(loader.getRecord("com.a.top").state).toBe("registered");
  });

  it("enableAll requires loadAll first", async () => {
    const cat = new PluginCatalog([plugin("com.a.one")]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a.one", () => fakePlugin());
    await expect(loader.enableAll()).rejects.toThrow(/not loaded/);
  });

  it("enableAll invokes onEnable in dep order after loadAll", async () => {
    const order: string[] = [];
    const cat = new PluginCatalog([
      plugin("com.a.leaf"),
      plugin("com.a.top", [{ id: "com.a.leaf" }]),
    ]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a.leaf", () =>
      fakePlugin({ onEnable: () => void order.push("leaf:enable") }),
    );
    loader.registerFactory("com.a.top", () =>
      fakePlugin({ onEnable: () => void order.push("top:enable") }),
    );
    await loader.loadAll();
    await loader.enableAll();
    expect(order).toEqual(["leaf:enable", "top:enable"]);
    expect(loader.records.map((r) => r.state)).toEqual(["enabled", "enabled"]);
  });

  it("disableAll invokes onDisable in REVERSE dep order", async () => {
    const order: string[] = [];
    const cat = new PluginCatalog([
      plugin("com.a.leaf"),
      plugin("com.a.top", [{ id: "com.a.leaf" }]),
    ]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a.leaf", () =>
      fakePlugin({ onDisable: () => void order.push("leaf:disable") }),
    );
    loader.registerFactory("com.a.top", () =>
      fakePlugin({ onDisable: () => void order.push("top:disable") }),
    );
    await loader.loadAll();
    await loader.enableAll();
    await loader.disableAll();
    // Top disables first (dependents before deps).
    expect(order).toEqual(["top:disable", "leaf:disable"]);
    expect(loader.records.map((r) => r.state)).toEqual([
      "disabled",
      "disabled",
    ]);
  });

  it("disableAll is best-effort: continues after a throw, surfaces first error", async () => {
    const order: string[] = [];
    const cat = new PluginCatalog([
      plugin("com.a.leaf"),
      plugin("com.a.top", [{ id: "com.a.leaf" }]),
    ]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a.leaf", () =>
      fakePlugin({ onDisable: () => void order.push("leaf:disable") }),
    );
    loader.registerFactory("com.a.top", () =>
      fakePlugin({
        onDisable: () => {
          order.push("top:disable");
          throw new Error("top blew up");
        },
      }),
    );
    await loader.loadAll();
    await loader.enableAll();
    await expect(loader.disableAll()).rejects.toThrow(PluginLifecycleError);
    // leaf still got disabled even after top failed.
    expect(order).toEqual(["top:disable", "leaf:disable"]);
    expect(loader.getRecord("com.a.top").state).toBe("failed");
    expect(loader.getRecord("com.a.leaf").state).toBe("disabled");
  });

  it("plugins with no lifecycle hooks transition through states cleanly", async () => {
    const cat = new PluginCatalog([plugin("com.a.one")]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a.one", () => fakePlugin()); // no hooks
    await loader.loadAll();
    expect(loader.getRecord("com.a.one").state).toBe("loaded");
    await loader.enableAll();
    expect(loader.getRecord("com.a.one").state).toBe("enabled");
    await loader.disableAll();
    expect(loader.getRecord("com.a.one").state).toBe("disabled");
  });

  it("loadAll is idempotent — re-calling skips already-loaded plugins", async () => {
    const cat = new PluginCatalog([plugin("com.a.one")]);
    const loader = new PluginLoader(cat);
    let loadCount = 0;
    loader.registerFactory("com.a.one", () =>
      fakePlugin({ onLoad: () => void loadCount++ }),
    );
    await loader.loadAll();
    await loader.loadAll();
    expect(loadCount).toBe(1);
  });

  it("threads PluginContext through lifecycle hooks when provider is supplied", async () => {
    interface Ctx {
      pluginId: string;
      registered: string[];
    }
    const cat = new PluginCatalog([
      plugin("com.a.one"),
      plugin("com.a.two", [{ id: "com.a.one" }]),
    ]);
    const registrations: Array<{ pluginId: string; event: string }> = [];
    const loader = new PluginLoader<Ctx>(cat, (manifest) => ({
      pluginId: manifest.id,
      registered: [],
    }));
    loader.registerFactory("com.a.one", () => ({
      onLoad: (ctx) => {
        ctx.registered.push("load");
        registrations.push({ pluginId: ctx.pluginId, event: "load" });
      },
      onEnable: (ctx) => {
        registrations.push({ pluginId: ctx.pluginId, event: "enable" });
      },
      onDisable: (ctx) => {
        registrations.push({ pluginId: ctx.pluginId, event: "disable" });
      },
    }));
    loader.registerFactory("com.a.two", () => ({
      onLoad: (ctx) => {
        registrations.push({ pluginId: ctx.pluginId, event: "load" });
      },
      onEnable: (ctx) => {
        registrations.push({ pluginId: ctx.pluginId, event: "enable" });
      },
      onDisable: (ctx) => {
        registrations.push({ pluginId: ctx.pluginId, event: "disable" });
      },
    }));
    await loader.loadAll();
    await loader.enableAll();
    await loader.disableAll();
    expect(registrations).toEqual([
      { pluginId: "com.a.one", event: "load" },
      { pluginId: "com.a.two", event: "load" },
      { pluginId: "com.a.one", event: "enable" },
      { pluginId: "com.a.two", event: "enable" },
      // disable order is REVERSE topological
      { pluginId: "com.a.two", event: "disable" },
      { pluginId: "com.a.one", event: "disable" },
    ]);
  });
});
