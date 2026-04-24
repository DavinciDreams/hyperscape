import { PluginManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginCatalog } from "../PluginCatalog.js";
import { PluginLoader } from "../PluginLoader.js";
import {
  buildHelloContextProvider,
  createHelloService,
  helloReferencePlugin,
  withScopeDispose,
  type HelloContext,
} from "../examples/HelloReferencePlugin.js";

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

describe("HelloReferencePlugin (Phase I reference integration)", () => {
  it("drives the full catalog → loader → context → scope loop", async () => {
    const service = createHelloService();
    const catalog = new PluginCatalog([
      manifest("com.ref.hello-alpha"),
      manifest("com.ref.hello-beta", ["com.ref.hello-alpha"]),
    ]);

    const loader = new PluginLoader<HelloContext>(
      catalog,
      buildHelloContextProvider(service),
    );

    loader.registerFactory(
      "com.ref.hello-alpha",
      withScopeDispose(() => helloReferencePlugin("alpha", "hello from alpha")),
    );
    loader.registerFactory(
      "com.ref.hello-beta",
      withScopeDispose(() => helloReferencePlugin("beta", "hello from beta")),
    );

    await loader.loadAll();
    expect(service.list().size).toBe(0); // onEnable not run yet

    await loader.enableAll();
    expect(Array.from(service.list().entries())).toEqual([
      ["alpha", "hello from alpha"],
      ["beta", "hello from beta"],
    ]);

    await loader.disableAll();
    expect(service.list().size).toBe(0); // scope.dispose() undid both
    expect(loader.getRecord("com.ref.hello-alpha").state).toBe("disabled");
    expect(loader.getRecord("com.ref.hello-beta").state).toBe("disabled");
  });

  it("scope.dispose runs in LIFO order even for transitive dependencies", async () => {
    const service = createHelloService();
    const disposeOrder: string[] = [];
    const originalUnregister = service.unregisterGreeting;
    service.unregisterGreeting = (name: string) => {
      disposeOrder.push(name);
      originalUnregister(name);
    };

    const catalog = new PluginCatalog([
      manifest("com.ref.first"),
      manifest("com.ref.second", ["com.ref.first"]),
    ]);
    const loader = new PluginLoader<HelloContext>(
      catalog,
      buildHelloContextProvider(service),
    );
    loader.registerFactory(
      "com.ref.first",
      withScopeDispose(() => helloReferencePlugin("g-first", "first")),
    );
    loader.registerFactory(
      "com.ref.second",
      withScopeDispose(() => helloReferencePlugin("g-second", "second")),
    );

    await loader.loadAll();
    await loader.enableAll();
    await loader.disableAll();

    // disableAll runs in REVERSE topo order: second, then first.
    expect(disposeOrder).toEqual(["g-second", "g-first"]);
  });

  it("disable is idempotent — re-disable is a no-op", async () => {
    const service = createHelloService();
    const catalog = new PluginCatalog([manifest("com.ref.solo")]);
    const loader = new PluginLoader<HelloContext>(
      catalog,
      buildHelloContextProvider(service),
    );
    loader.registerFactory(
      "com.ref.solo",
      withScopeDispose(() => helloReferencePlugin("solo", "hi")),
    );
    await loader.loadAll();
    await loader.enableAll();
    await loader.disableAll();
    expect(service.list().size).toBe(0);
    // second disableAll is a no-op (state already "disabled")
    await loader.disableAll();
    expect(service.list().size).toBe(0);
  });

  it("plugin failure during onEnable leaves registered disposables in place (caller must handle manually)", async () => {
    const service = createHelloService();
    const catalog = new PluginCatalog([manifest("com.ref.flaky")]);
    const loader = new PluginLoader<HelloContext>(
      catalog,
      buildHelloContextProvider(service),
    );
    loader.registerFactory(
      "com.ref.flaky",
      withScopeDispose(() => ({
        onEnable(ctx) {
          ctx.addGreeting("flaky", "registered before throw");
          throw new Error("boom");
        },
      })),
    );
    await loader.loadAll();
    await expect(loader.enableAll()).rejects.toThrow("boom");
    // Plugin is "failed". disableAll skips failed plugins so the
    // greeting remains registered — this is intentional. A higher
    // layer (PluginHost wrapper) would drain the scope on failure.
    expect(service.list().size).toBe(1);
    expect(loader.getRecord("com.ref.flaky").state).toBe("failed");
  });

  it("user onDisable still runs before scope.dispose under withScopeDispose wrapper", async () => {
    const service = createHelloService();
    const events: string[] = [];
    const catalog = new PluginCatalog([manifest("com.ref.tracer")]);
    const loader = new PluginLoader<HelloContext>(
      catalog,
      buildHelloContextProvider(service),
    );
    loader.registerFactory(
      "com.ref.tracer",
      withScopeDispose(() => ({
        onEnable(ctx) {
          ctx.addGreeting("tracer", "x");
          ctx.scope.register(() => void events.push("scope-disposer"));
        },
        onDisable() {
          events.push("user-onDisable");
        },
      })),
    );
    await loader.loadAll();
    await loader.enableAll();
    await loader.disableAll();
    // user.onDisable first, then scope.dispose (LIFO inside scope)
    expect(events).toEqual(["user-onDisable", "scope-disposer"]);
    expect(service.list().size).toBe(0);
  });
});
