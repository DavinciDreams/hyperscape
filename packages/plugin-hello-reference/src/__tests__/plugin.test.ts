/**
 * Reference-plugin smoke tests.
 *
 * Scope: prove an external package built on `@hyperforge/gameplay-framework`
 * can (a) ship a valid `plugin.json` that parses through the manifest schema,
 * and (b) produce a factory whose lifecycle hooks mutate author-defined
 * service state with scope-tracked teardown.
 *
 * This test does NOT exercise `shared`'s `PluginHost` runtime — it drives
 * the lifecycle by hand using the canonical `createPluginContextScope` from
 * `@hyperforge/gameplay-framework`. The point is to prove the facade is
 * sufficient for authoring. Integration with the real host lives in
 * `packages/shared/src/plugin/__tests__/` (already shipped).
 */

import { describe, expect, it } from "vitest";

import { createPluginContextScope } from "@hyperforge/gameplay-framework";

import {
  createHelloService,
  helloReferencePluginFactory,
  manifest,
  type HelloContext,
  type HelloService,
} from "../index.js";

function makeContext(pluginId: string, service: HelloService): HelloContext {
  const scope = createPluginContextScope(pluginId);
  return {
    pluginId,
    scope,
    addGreeting(name, text) {
      service.registerGreeting(name, text);
      scope.register(() => service.unregisterGreeting(name));
    },
  };
}

describe("@hyperforge/plugin-hello-reference", () => {
  it("ships a plugin.json that parses through PluginManifestSchema", () => {
    expect(manifest.id).toBe("com.hyperforge.plugin-hello-reference");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.entry).toBe("./dist/index.js");
    expect(manifest.author.name).toBe("Hyperforge");
    expect(manifest.hyperforgeApi).toBe("0.1.0");
    expect(manifest.enabledByDefault).toBe(false);
  });

  it("registers a greeting on enable and unregisters it via scope drain on disable", async () => {
    const service = createHelloService();
    const ctx = makeContext("com.hyperforge.plugin-hello-reference", service);

    const factory = helloReferencePluginFactory("world", "hello, world");
    const plugin = factory();

    // Before any hook runs, the service is empty.
    expect(service.list().size).toBe(0);

    // onEnable registers.
    await plugin.onEnable?.(ctx);
    expect(service.list().size).toBe(1);
    expect(service.list().get("world")).toBe("hello, world");

    // Scope drain (simulating host disable) unregisters.
    await ctx.scope.dispose();
    expect(service.list().size).toBe(0);
  });

  it("is a data-only plugin — no onLoad/onDisable hooks", () => {
    const factory = helloReferencePluginFactory("a", "b");
    const plugin = factory();
    expect(plugin.onLoad).toBeUndefined();
    expect(plugin.onDisable).toBeUndefined();
    expect(typeof plugin.onEnable).toBe("function");
  });

  it("supports multiple independent factory calls (each produces a fresh instance)", () => {
    const a = helloReferencePluginFactory("alpha", "1")();
    const b = helloReferencePluginFactory("beta", "2")();
    expect(a).not.toBe(b);
    // But both expose the same lifecycle shape.
    expect(typeof a.onEnable).toBe("function");
    expect(typeof b.onEnable).toBe("function");
  });

  it("refuses duplicate greeting registration (service invariant holds across instances)", async () => {
    const service = createHelloService();
    const ctxA = makeContext(
      "com.hyperforge.plugin-hello-reference#a",
      service,
    );
    const ctxB = makeContext(
      "com.hyperforge.plugin-hello-reference#b",
      service,
    );

    await helloReferencePluginFactory("world", "first")().onEnable?.(ctxA);
    // Second factory instance tries to register the same greeting name.
    // onEnable is synchronous, so the service's invariant guard throws
    // synchronously — wrap in an async thunk to surface it as a rejection.
    await expect(async () =>
      helloReferencePluginFactory("world", "second")().onEnable?.(ctxB),
    ).rejects.toThrow(/already registered/);
  });
});
