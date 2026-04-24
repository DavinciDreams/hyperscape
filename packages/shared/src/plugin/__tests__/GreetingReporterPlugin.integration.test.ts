import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContextScope } from "../PluginContextScope.js";
import {
  type HelloContext,
  createHelloService,
  helloReferencePlugin,
} from "../examples/HelloReferencePlugin.js";
import {
  createGreetingReportSink,
  greetingReporterPlugin,
} from "../examples/GreetingReporterPlugin.js";
import { createPluginHostFromRegistry } from "../PluginRegistryBootstrap.js";

function manifestFor(id: string, deps: string[] = []): PluginManifest {
  // Registry schema will apply plugin-schema defaults when parsed.
  return {
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    dependencies: deps.map((d) => ({ id: d, versionRange: "^1.0.0" })),
  } as PluginManifest;
}

describe("GreetingReporterPlugin (I3 reference integration)", () => {
  it("dependency ordering: reporter sees greetings registered by upstream plugin", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        manifestFor("com.reference.hello"),
        manifestFor("com.reference.greeting-reporter", ["com.reference.hello"]),
      ],
    });
    const service = createHelloService();
    const sink = createGreetingReportSink();

    const host = createPluginHostFromRegistry<HelloContext>({
      registry,
      buildContext: (manifest, scope: PluginContextScope) => ({
        pluginId: manifest.id,
        scope,
        addGreeting(name, text) {
          service.registerGreeting(name, text);
          scope.register(() => service.unregisterGreeting(name));
        },
      }),
      factories: {
        "com.reference.hello": () =>
          helloReferencePlugin("world", "hello, world"),
        "com.reference.greeting-reporter": () =>
          greetingReporterPlugin(service, sink),
      },
    });

    await host.loadAll();
    await host.enableAll();

    // Because `greeting-reporter` depends on `hello`, `enableAll` ran
    // `hello.onEnable` first, registering "world → hello, world", and
    // the reporter's `onEnable` saw it.
    expect(sink.latest).toEqual({
      observedAt: "onEnable",
      greetings: [{ name: "world", text: "hello, world" }],
    });
  });

  it("disable (reverse-topo) clears sink before the upstream's greetings unregister", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        manifestFor("com.reference.hello"),
        manifestFor("com.reference.greeting-reporter", ["com.reference.hello"]),
      ],
    });
    const service = createHelloService();
    const sink = createGreetingReportSink();

    const host = createPluginHostFromRegistry<HelloContext>({
      registry,
      buildContext: (manifest, scope) => ({
        pluginId: manifest.id,
        scope,
        addGreeting(name, text) {
          service.registerGreeting(name, text);
          scope.register(() => service.unregisterGreeting(name));
        },
      }),
      factories: {
        "com.reference.hello": () =>
          helloReferencePlugin("world", "hello, world"),
        "com.reference.greeting-reporter": () =>
          greetingReporterPlugin(service, sink),
      },
    });

    await host.loadAll();
    await host.enableAll();
    expect(sink.latest).not.toBeNull();
    expect(service.list().size).toBe(1);

    await host.disableAll();

    // Reverse-topo disable: reporter's scope disposer runs first
    // (clearing sink), then hello's unregisters "world".
    expect(sink.latest).toBeNull();
    expect(service.list().size).toBe(0);
  });

  it("state snapshot reflects full lifecycle for both plugins", async () => {
    const registry = PluginRegistryManifestSchema.parse({
      plugins: [
        manifestFor("com.reference.hello"),
        manifestFor("com.reference.greeting-reporter", ["com.reference.hello"]),
      ],
    });
    const service = createHelloService();
    const sink = createGreetingReportSink();

    const host = createPluginHostFromRegistry<HelloContext>({
      registry,
      buildContext: (manifest, scope) => ({
        pluginId: manifest.id,
        scope,
        addGreeting(name, text) {
          service.registerGreeting(name, text);
          scope.register(() => service.unregisterGreeting(name));
        },
      }),
      factories: {
        "com.reference.hello": () => helloReferencePlugin("x", "y"),
        "com.reference.greeting-reporter": () =>
          greetingReporterPlugin(service, sink),
      },
    });

    expect(host.snapshot().registered.sort()).toEqual([
      "com.reference.greeting-reporter",
      "com.reference.hello",
    ]);
    await host.loadAndEnable();
    expect(host.snapshot().enabled.sort()).toEqual([
      "com.reference.greeting-reporter",
      "com.reference.hello",
    ]);
    await host.destroy();
    expect(host.snapshot().disabled.sort()).toEqual([
      "com.reference.greeting-reporter",
      "com.reference.hello",
    ]);
  });
});
