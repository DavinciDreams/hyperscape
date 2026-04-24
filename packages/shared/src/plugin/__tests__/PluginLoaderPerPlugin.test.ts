import { PluginManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import { PluginCatalog } from "../PluginCatalog.js";
import {
  type HyperforgePlugin,
  MissingHardDependencyError,
  PluginLifecycleError,
  PluginLoader,
} from "../PluginLoader.js";

function plugin(id: string, deps: { id: string; optional?: boolean }[] = []) {
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
    loadAfter: [],
  });
}

function fakePlugin(hooks: Partial<HyperforgePlugin> = {}): HyperforgePlugin {
  return hooks;
}

describe("PluginLoader.enablePlugin", () => {
  it("transitions loaded→enabled via onEnable", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    const onEnable = vi.fn();
    loader.registerFactory("com.a", () => fakePlugin({ onEnable }));
    await loader.loadAll();
    await loader.enablePlugin("com.a");
    expect(onEnable).toHaveBeenCalledOnce();
    expect(loader.getRecord("com.a").state).toBe("enabled");
  });

  it("is a no-op when already enabled", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    const onEnable = vi.fn();
    loader.registerFactory("com.a", () => fakePlugin({ onEnable }));
    await loader.loadAll();
    await loader.enablePlugin("com.a");
    await loader.enablePlugin("com.a");
    expect(onEnable).toHaveBeenCalledOnce();
  });

  it("throws when state is registered", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a", () => fakePlugin());
    await expect(loader.enablePlugin("com.a")).rejects.toThrow(/not loaded/);
  });

  it("throws when state is failed", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a", () =>
      fakePlugin({
        onLoad: () => {
          throw new Error("boom");
        },
      }),
    );
    await expect(loader.loadAll()).rejects.toThrow(PluginLifecycleError);
    await expect(loader.enablePlugin("com.a")).rejects.toThrow(/failed state/);
  });

  it("rejects when hard deps are not currently enabled", async () => {
    const cat = new PluginCatalog([
      plugin("com.dep"),
      plugin("com.a", [{ id: "com.dep" }]),
    ]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.dep", () => fakePlugin());
    loader.registerFactory("com.a", () => fakePlugin());
    await loader.loadAll();
    // com.dep is loaded but not enabled
    await expect(loader.enablePlugin("com.a")).rejects.toThrow(
      MissingHardDependencyError,
    );
  });

  it("re-enables after disable (disabled→enabled)", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    const onEnable = vi.fn();
    loader.registerFactory("com.a", () => fakePlugin({ onEnable }));
    await loader.loadAll();
    await loader.enablePlugin("com.a");
    await loader.disablePlugin("com.a");
    await loader.enablePlugin("com.a");
    expect(onEnable).toHaveBeenCalledTimes(2);
    expect(loader.getRecord("com.a").state).toBe("enabled");
  });

  it("promotes to failed when onEnable throws", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a", () =>
      fakePlugin({
        onEnable: () => {
          throw new Error("boom");
        },
      }),
    );
    await loader.loadAll();
    await expect(loader.enablePlugin("com.a")).rejects.toThrow(
      PluginLifecycleError,
    );
    expect(loader.getRecord("com.a").state).toBe("failed");
  });
});

describe("PluginLoader.disablePlugin", () => {
  it("transitions enabled→disabled via onDisable", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    const onDisable = vi.fn();
    loader.registerFactory("com.a", () => fakePlugin({ onDisable }));
    await loader.loadAll();
    await loader.enablePlugin("com.a");
    await loader.disablePlugin("com.a");
    expect(onDisable).toHaveBeenCalledOnce();
    expect(loader.getRecord("com.a").state).toBe("disabled");
  });

  it("is a no-op when not enabled", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    const onDisable = vi.fn();
    loader.registerFactory("com.a", () => fakePlugin({ onDisable }));
    await loader.loadAll();
    await loader.disablePlugin("com.a"); // loaded state
    expect(onDisable).not.toHaveBeenCalled();
    expect(loader.getRecord("com.a").state).toBe("loaded");
  });

  it("refuses when enabled dependents exist", async () => {
    const cat = new PluginCatalog([
      plugin("com.dep"),
      plugin("com.a", [{ id: "com.dep" }]),
    ]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.dep", () => fakePlugin());
    loader.registerFactory("com.a", () => fakePlugin());
    await loader.loadAll();
    await loader.enableAll();
    await expect(loader.disablePlugin("com.dep")).rejects.toThrow(
      /enabled dependents: com\.a/,
    );
  });

  it("force=true bypasses dependents check", async () => {
    const cat = new PluginCatalog([
      plugin("com.dep"),
      plugin("com.a", [{ id: "com.dep" }]),
    ]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.dep", () => fakePlugin());
    loader.registerFactory("com.a", () => fakePlugin());
    await loader.loadAll();
    await loader.enableAll();
    await loader.disablePlugin("com.dep", { force: true });
    expect(loader.getRecord("com.dep").state).toBe("disabled");
    // dependent left enabled — caller's problem
    expect(loader.getRecord("com.a").state).toBe("enabled");
  });

  it("promotes to failed when onDisable throws", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a", () =>
      fakePlugin({
        onDisable: () => {
          throw new Error("boom");
        },
      }),
    );
    await loader.loadAll();
    await loader.enablePlugin("com.a");
    await expect(loader.disablePlugin("com.a")).rejects.toThrow(
      PluginLifecycleError,
    );
    expect(loader.getRecord("com.a").state).toBe("failed");
  });
});

describe("PluginLoader.reloadPlugin", () => {
  it("rebuilds a loaded plugin, keeps state=loaded", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    const onLoad = vi.fn();
    let built = 0;
    loader.registerFactory("com.a", () => {
      built++;
      return fakePlugin({ onLoad });
    });
    await loader.loadAll();
    await loader.reloadPlugin("com.a");
    expect(built).toBe(2);
    expect(onLoad).toHaveBeenCalledTimes(2);
    expect(loader.getRecord("com.a").state).toBe("loaded");
  });

  it("rebuilds an enabled plugin, keeps state=enabled", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    const onDisable = vi.fn();
    const onLoad = vi.fn();
    const onEnable = vi.fn();
    loader.registerFactory("com.a", () =>
      fakePlugin({ onLoad, onEnable, onDisable }),
    );
    await loader.loadAll();
    await loader.enablePlugin("com.a");
    await loader.reloadPlugin("com.a");
    expect(onDisable).toHaveBeenCalledOnce();
    expect(onLoad).toHaveBeenCalledTimes(2);
    expect(onEnable).toHaveBeenCalledTimes(2);
    expect(loader.getRecord("com.a").state).toBe("enabled");
  });

  it("clears failed state by rebuilding from factory", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    let callCount = 0;
    loader.registerFactory("com.a", () => {
      callCount++;
      // First call throws during onLoad, second call succeeds
      if (callCount === 1) {
        return fakePlugin({
          onLoad: () => {
            throw new Error("boom");
          },
        });
      }
      return fakePlugin();
    });
    await expect(loader.loadAll()).rejects.toThrow(PluginLifecycleError);
    expect(loader.getRecord("com.a").state).toBe("failed");
    await loader.reloadPlugin("com.a");
    expect(loader.getRecord("com.a").state).toBe("loaded");
    expect(loader.getRecord("com.a").error).toBeNull();
  });

  it("throws when state is registered (never loaded)", async () => {
    const cat = new PluginCatalog([plugin("com.a")]);
    const loader = new PluginLoader(cat);
    loader.registerFactory("com.a", () => fakePlugin());
    await expect(loader.reloadPlugin("com.a")).rejects.toThrow(/not loaded/);
  });
});
