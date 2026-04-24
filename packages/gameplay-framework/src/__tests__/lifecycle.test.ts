/**
 * Tests for the plugin lifecycle driver.
 *
 * Coverage:
 *   - Start runs onLoad → onEnable per plugin in input order
 *   - Start is sequential (later plugin sees earlier plugin's state)
 *   - Start fails fast — later plugins don't run when an earlier one throws
 *   - Stop runs onDisable in REVERSE order
 *   - Stop always drains scope even if onDisable throws (try/finally)
 *   - Stop collects errors; single throw → rethrow; multi → wrap
 *   - Empty ordered list is a no-op
 *   - Plugins can register scope cleanup that fires on stop
 *   - End-to-end: full start → interact → stop roundtrip
 */

import { describe, expect, it } from "vitest";

import {
  PluginLifecycleStopError,
  PluginManifestSchema,
  startPluginsInOrder,
  stopPluginsInReverseOrder,
  type HyperforgePlugin,
  type LoadedPluginModule,
  type PluginContextBase,
  type PluginContextScopeHandle,
  type PluginInstanceRecord,
  type PluginManifest,
} from "../index.js";

// ────────────────────────────────────────────────────────────────────────
// Test plumbing
// ────────────────────────────────────────────────────────────────────────

interface TestContext extends PluginContextBase {
  readonly trace: string[];
}

function mkManifest(id: string): PluginManifest {
  return PluginManifestSchema.parse({
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "0.1.0",
  });
}

function mkModule(
  id: string,
  plugin: HyperforgePlugin<TestContext>,
): LoadedPluginModule<TestContext> {
  return {
    manifest: mkManifest(id),
    factory: () => plugin,
  };
}

function mkContextFactory(trace: string[]) {
  return ({
    pluginId,
    scope,
  }: {
    pluginId: string;
    scope: PluginContextScopeHandle;
  }): TestContext => ({
    pluginId,
    scope,
    trace,
  });
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("startPluginsInOrder — happy path", () => {
  it("runs onLoad then onEnable on each plugin in topo order", async () => {
    const trace: string[] = [];
    const mkPlugin = (id: string): HyperforgePlugin<TestContext> => ({
      async onLoad(ctx) {
        ctx.trace.push(`${id}:load`);
      },
      async onEnable(ctx) {
        ctx.trace.push(`${id}:enable`);
      },
    });

    const ordered = [
      mkModule("com.example.a", mkPlugin("a")),
      mkModule("com.example.b", mkPlugin("b")),
    ];

    const records = await startPluginsInOrder(ordered, mkContextFactory(trace));

    expect(records).toHaveLength(2);
    expect(records[0]!.manifest.id).toBe("com.example.a");
    expect(records[1]!.manifest.id).toBe("com.example.b");
    // a fully runs (load + enable) before b starts — sequential semantics.
    expect(trace).toEqual(["a:load", "a:enable", "b:load", "b:enable"]);
  });

  it("skips missing lifecycle hooks (data-only plugins are valid)", async () => {
    const trace: string[] = [];
    const ordered = [mkModule("com.example.dataonly", {} /* no hooks */)];
    const records = await startPluginsInOrder(ordered, mkContextFactory(trace));
    expect(records).toHaveLength(1);
    expect(trace).toEqual([]);
  });

  it("threads a fresh scope + ctx per plugin", async () => {
    const trace: string[] = [];
    const captured: TestContext[] = [];
    const plugin: HyperforgePlugin<TestContext> = {
      async onEnable(ctx) {
        captured.push(ctx);
      },
    };
    const ordered = [
      mkModule("com.example.a", plugin),
      mkModule("com.example.b", plugin),
    ];
    await startPluginsInOrder(ordered, mkContextFactory(trace));
    expect(captured).toHaveLength(2);
    expect(captured[0]!.pluginId).toBe("com.example.a");
    expect(captured[1]!.pluginId).toBe("com.example.b");
    expect(captured[0]!.scope).not.toBe(captured[1]!.scope);
  });

  it("is a no-op on an empty ordered list", async () => {
    const trace: string[] = [];
    const records = await startPluginsInOrder([], mkContextFactory(trace));
    expect(records).toEqual([]);
    expect(trace).toEqual([]);
  });
});

describe("startPluginsInOrder — fail-fast", () => {
  it("propagates an onLoad error and does not run later plugins", async () => {
    const trace: string[] = [];
    const boom = new Error("a-load-boom");
    const ordered = [
      mkModule("com.example.a", {
        async onLoad() {
          throw boom;
        },
        async onEnable(ctx) {
          ctx.trace.push("a:enable"); // should never run
        },
      }),
      mkModule("com.example.b", {
        async onLoad(ctx) {
          ctx.trace.push("b:load"); // should never run
        },
      }),
    ];

    await expect(
      startPluginsInOrder(ordered, mkContextFactory(trace)),
    ).rejects.toBe(boom);

    expect(trace).toEqual([]);
  });

  it("propagates an onEnable error mid-sequence", async () => {
    const trace: string[] = [];
    const boom = new Error("a-enable-boom");
    const ordered = [
      mkModule("com.example.a", {
        async onLoad(ctx) {
          ctx.trace.push("a:load");
        },
        async onEnable() {
          throw boom;
        },
      }),
      mkModule("com.example.b", {
        async onEnable(ctx) {
          ctx.trace.push("b:enable");
        },
      }),
    ];

    await expect(
      startPluginsInOrder(ordered, mkContextFactory(trace)),
    ).rejects.toBe(boom);

    // a.onLoad ran, a.onEnable threw, b never ran.
    expect(trace).toEqual(["a:load"]);
  });
});

describe("stopPluginsInReverseOrder — happy path", () => {
  it("calls onDisable in REVERSE order then drains each scope", async () => {
    const trace: string[] = [];
    const mkPlugin = (id: string): HyperforgePlugin<TestContext> => ({
      async onEnable(ctx) {
        // Register a scope cleanup so we can verify scope drain runs.
        ctx.scope.register(() => {
          ctx.trace.push(`${id}:scope-drain`);
        });
      },
      async onDisable(ctx) {
        ctx.trace.push(`${id}:disable`);
      },
    });

    const ordered = [
      mkModule("com.example.a", mkPlugin("a")),
      mkModule("com.example.b", mkPlugin("b")),
    ];
    const records = await startPluginsInOrder(ordered, mkContextFactory(trace));
    trace.length = 0; // clear start trace, focus on stop

    await stopPluginsInReverseOrder(records);

    // Reverse topo: b first, then a. Each plugin: onDisable → scope drain.
    expect(trace).toEqual([
      "b:disable",
      "b:scope-drain",
      "a:disable",
      "a:scope-drain",
    ]);
  });

  it("is a no-op on an empty records list", async () => {
    await expect(stopPluginsInReverseOrder([])).resolves.toBeUndefined();
  });
});

describe("stopPluginsInReverseOrder — best-effort drain", () => {
  it("drains scope even when onDisable throws (try/finally)", async () => {
    const trace: string[] = [];
    const ordered = [
      mkModule("com.example.a", {
        async onEnable(ctx) {
          ctx.scope.register(() => {
            ctx.trace.push("a:scope-drain");
          });
        },
        async onDisable() {
          throw new Error("a-disable-boom");
        },
      }),
    ];
    const records = await startPluginsInOrder(ordered, mkContextFactory(trace));
    trace.length = 0;

    // The thrown onDisable error propagates at the end of the stop walk.
    await expect(stopPluginsInReverseOrder(records)).rejects.toThrow(
      /a-disable-boom/,
    );

    // scope still drained despite the onDisable throw.
    expect(trace).toEqual(["a:scope-drain"]);
  });

  it("continues unwinding later plugins after an earlier onDisable throws", async () => {
    const trace: string[] = [];
    const ordered = [
      mkModule("com.example.first-to-start", {
        async onDisable(ctx) {
          ctx.trace.push("first-to-start:disable");
        },
      }),
      mkModule("com.example.second-to-start", {
        async onDisable() {
          throw new Error("second-boom");
        },
      }),
      mkModule("com.example.third-to-start", {
        async onDisable(ctx) {
          ctx.trace.push("third-to-start:disable");
        },
      }),
    ];
    const records = await startPluginsInOrder(ordered, mkContextFactory(trace));
    trace.length = 0;

    await expect(stopPluginsInReverseOrder(records)).rejects.toThrow(
      /second-boom/,
    );

    // Reverse order: third, then second (throws), then first still runs.
    expect(trace).toEqual(["third-to-start:disable", "first-to-start:disable"]);
  });

  it("wraps multiple onDisable errors in PluginLifecycleStopError", async () => {
    const trace: string[] = [];
    const errA = new Error("a-boom");
    const errB = new Error("b-boom");
    const ordered = [
      mkModule("com.example.a", {
        async onDisable() {
          throw errA;
        },
      }),
      mkModule("com.example.b", {
        async onDisable() {
          throw errB;
        },
      }),
    ];
    const records = await startPluginsInOrder(ordered, mkContextFactory(trace));

    let caught: unknown;
    try {
      await stopPluginsInReverseOrder(records);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(PluginLifecycleStopError);
    const asLifecycleErr = caught as PluginLifecycleStopError;
    expect(asLifecycleErr.errors).toHaveLength(2);
    // Reverse order: b disabled first → errB appears first.
    expect(asLifecycleErr.errors[0]).toBe(errB);
    expect(asLifecycleErr.errors[1]).toBe(errA);
  });
});

describe("lifecycle end-to-end", () => {
  it("full roundtrip: start, plugin mutates shared state, stop drains it", async () => {
    interface RegistryCtx extends PluginContextBase {
      readonly registry: Set<string>;
    }
    const registry = new Set<string>();

    // Plugin registers an entry on enable, cleans it up via scope on stop.
    const plugin: HyperforgePlugin<RegistryCtx> = {
      async onEnable(ctx) {
        ctx.registry.add(ctx.pluginId);
        ctx.scope.register(() => {
          ctx.registry.delete(ctx.pluginId);
        });
      },
    };

    const ordered: Array<LoadedPluginModule<RegistryCtx>> = [
      { manifest: mkManifest("com.example.a"), factory: () => plugin },
      { manifest: mkManifest("com.example.b"), factory: () => plugin },
    ];

    const records: Array<PluginInstanceRecord<RegistryCtx>> =
      await startPluginsInOrder(ordered, ({ pluginId, scope }) => ({
        pluginId,
        scope,
        registry,
      }));

    // After start, registry holds both plugin ids.
    expect([...registry].sort()).toEqual(["com.example.a", "com.example.b"]);

    await stopPluginsInReverseOrder(records);

    // After stop, registry is empty (cleanup fired on each scope).
    expect([...registry]).toEqual([]);
  });
});
