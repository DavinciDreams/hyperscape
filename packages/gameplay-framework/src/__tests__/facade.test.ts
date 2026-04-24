/**
 * Smoke tests for the @hyperforge/gameplay-framework public surface.
 *
 * Scope: prove the package compiles + its exported types and schemas
 * are usable exactly as a plugin author would use them.
 *   - `PluginManifestSchema.parse` round-trips a valid manifest
 *   - `HyperforgePlugin<TContext>` types are structurally compatible
 *     with a concrete plugin + factory
 *   - `PluginContextBase` / `PluginContextScopeHandle` can be
 *     implemented by authors without importing shared
 */

import { describe, expect, it } from "vitest";

import {
  PluginManifestSchema,
  type HyperforgePlugin,
  type PluginContextBase,
  type PluginContextScopeHandle,
  type PluginFactory,
  type PluginManifest,
} from "../index.js";

describe("@hyperforge/gameplay-framework public surface", () => {
  it("re-exports PluginManifestSchema and validates a minimal manifest", () => {
    const raw: unknown = {
      id: "com.example.hello",
      name: "Hello",
      version: "0.1.0",
      entry: "./dist/index.js",
      author: { name: "example" },
      hyperforgeApi: "0.1.0",
    };
    const parsed: PluginManifest = PluginManifestSchema.parse(raw);
    expect(parsed.id).toBe("com.example.hello");
    expect(parsed.version).toBe("0.1.0");
    expect(parsed.author.name).toBe("example");
  });

  it("rejects an invalid manifest (missing id)", () => {
    const raw: unknown = {
      name: "Hello",
      version: "0.1.0",
      entry: "./dist/index.js",
      author: { name: "example" },
      hyperforgeApi: "0.1.0",
    };
    expect(() => PluginManifestSchema.parse(raw)).toThrow();
  });

  it("lets authors implement HyperforgePlugin<TContext> with a custom context", async () => {
    // Author-defined context extending PluginContextBase.
    interface HelloContext extends PluginContextBase {
      greetings: string[];
    }

    // Track lifecycle side-effects so the test can assert order.
    const trace: string[] = [];

    const factory: PluginFactory<HelloContext> = () => {
      const plugin: HyperforgePlugin<HelloContext> = {
        async onLoad(ctx) {
          trace.push(`load:${ctx.pluginId}`);
        },
        async onEnable(ctx) {
          ctx.greetings.push("hello");
          trace.push(`enable:${ctx.pluginId}`);
        },
        async onDisable(ctx) {
          trace.push(`disable:${ctx.pluginId}`);
        },
      };
      return plugin;
    };

    // Build a minimal scope handle — proves authors can implement the
    // handle interface without pulling in shared's PluginContextScope.
    const disposers: Array<() => void | Promise<void>> = [];
    const scope: PluginContextScopeHandle = {
      pluginId: "com.example.hello",
      register(d) {
        disposers.push(d);
      },
      async dispose() {
        while (disposers.length > 0) {
          const d = disposers.pop()!;
          await d();
        }
      },
      reopen() {
        // no-op for the smoke test
      },
    };

    const ctx: HelloContext = {
      pluginId: "com.example.hello",
      scope,
      greetings: [],
    };

    const plugin = factory();
    await plugin.onLoad?.(ctx);
    await plugin.onEnable?.(ctx);
    await plugin.onDisable?.(ctx);

    expect(trace).toEqual([
      "load:com.example.hello",
      "enable:com.example.hello",
      "disable:com.example.hello",
    ]);
    expect(ctx.greetings).toEqual(["hello"]);
  });

  it("allows data-only plugins (no lifecycle hooks)", () => {
    // Pure-manifest plugin — no factory body besides returning {}.
    const factory: PluginFactory = () => ({});
    const plugin = factory();
    expect(plugin.onLoad).toBeUndefined();
    expect(plugin.onEnable).toBeUndefined();
    expect(plugin.onDisable).toBeUndefined();
  });

  it("supports default void context (no TContext generic supplied)", async () => {
    let called = false;
    const plugin: HyperforgePlugin = {
      onEnable() {
        called = true;
      },
    };
    await plugin.onEnable?.();
    expect(called).toBe(true);
  });
});
